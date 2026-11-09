// WebRTC em malha: voz espacial (por proximidade) e compartilhamento de tela.
// Cada par tem uma conexão com 2 transceivers fixos (áudio + vídeo); ligar/desligar
// microfone ou tela só troca a trilha com replaceTrack, sem renegociar.
// Quem entra depois inicia a conexão (faz a oferta) com quem já estava.
import * as THREE from 'three';

export class RTC {
  constructor({ send, iceServers, audioCtx, onVideo, onSpeaking, onLocalSpeaking, noiseLevel }) {
    this.send = send; this.iceServers = iceServers || []; this.ctx = audioCtx;
    this.onVideo = onVideo; this.onSpeaking = onSpeaking; this.onLocalSpeaking = onLocalSpeaking;
    this.noiseLevel = noiseLevel || 'normal'; this.localSpeaking = false; this.gate = null;
    this.peers = new Map();
    this.micTrack = null; this.micOn = false; this.screenTrack = null;
    this.master = audioCtx.createGain();
    this.master.connect(audioCtx.destination);
    this.lastLevel = 0;
  }
  _create(id) {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const p = { id, pc, queue: Promise.resolve(), pending: [], audioT: null, videoT: null, saudT: null, nodes: null, videoEl: null, videoStream: null, screenAudioEl: null, speaking: false };
    pc.onicecandidate = e => { if (e.candidate) this.send({ t: 'signal', to: id, data: { candidate: e.candidate.toJSON() } }); };
    // ordem fixa dos transceivers: 0 = microfone, 1 = vídeo da tela, 2 = som da tela
    pc.ontrack = e => this._onTrack(p, e.track, pc.getTransceivers().indexOf(e.transceiver));
    this.peers.set(id, p);
    return p;
  }
  call(id) {
    if (this.peers.has(id)) return;
    const p = this._create(id);
    const pc = p.pc;
    pc.onnegotiationneeded = async () => {
      try { await pc.setLocalDescription(); this.send({ t: 'signal', to: id, data: { sdp: pc.localDescription.toJSON() } }); }
      catch (e) { console.warn('oferta falhou', e); }
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' && pc.restartIce) pc.restartIce(); };
    p.audioT = pc.addTransceiver('audio', { direction: 'sendrecv' });
    p.videoT = pc.addTransceiver('video', { direction: 'sendrecv' });
    this._prefCodecs(p.videoT);
    p.saudT = pc.addTransceiver('audio', { direction: 'sendrecv' }); // som da tela compartilhada
    this._apply(p);
  }
  onSignal(from, data) {
    const p = this.peers.get(from) || this._create(from);
    p.queue = p.queue.then(() => this._handle(p, data)).catch(e => console.warn('sinalização', e));
  }
  async _handle(p, data) {
    const pc = p.pc;
    if (data.sdp) {
      await pc.setRemoteDescription(data.sdp);
      if (data.sdp.type === 'offer') {
        pc.getTransceivers().forEach((t, i) => {
          const kind = t.receiver.track.kind;
          if (kind === 'audio') { if (i === 0) p.audioT = t; else p.saudT = t; }
          else if (kind === 'video') { p.videoT = t; this._prefCodecs(t); }
          t.direction = 'sendrecv';
        });
        this._apply(p);
        await pc.setLocalDescription();
        this.send({ t: 'signal', to: p.id, data: { sdp: pc.localDescription.toJSON() } });
      }
      for (const c of p.pending.splice(0)) await pc.addIceCandidate(c).catch(() => {});
      this._apply(p); // reaplica limites de bitrate agora que a negociação terminou
    } else if (data.candidate) {
      if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
      else p.pending.push(data.candidate);
    } else if (typeof data.watch === 'boolean') {
      // o outro avisou se está vendo minha tela (perto dela ou com o visualizador aberto)
      if (p.watch !== data.watch) { p.watch = data.watch; this._tuneAll(); if (p.saudT) p.saudT.sender.replaceTrack(p.watch ? this.screenAudioTrack : null).catch(() => {}); }
    }
  }
  // avisa quem compartilha se estou assistindo a tela dela (manda de novo de tempos em tempos)
  setWatching(id, on) {
    const p = this.peers.get(id);
    if (!p) return;
    const now = performance.now();
    if (p.sentWatch === on && now - (p.sentWatchAt || 0) < 5000) return;
    p.sentWatch = on; p.sentWatchAt = now;
    this.send({ t: 'signal', to: id, data: { watch: on } });
  }
  // codecs melhores para tela primeiro: VP9 (ferramentas para texto/tela), depois H.264 (aceleração
  // por hardware), depois o resto. Mantém todos: o outro lado escolhe o primeiro que ele também tiver.
  _prefCodecs(t) {
    try {
      const caps = RTCRtpReceiver.getCapabilities && RTCRtpReceiver.getCapabilities('video');
      if (!caps || !t.setCodecPreferences) return;
      const rank = c => { const m = c.mimeType.toLowerCase(); return m === 'video/vp9' ? 0 : m === 'video/h264' ? 1 : m === 'video/vp8' ? 2 : 3; };
      t.setCodecPreferences(caps.codecs.slice().sort((a, b) => rank(a) - rank(b)));
    } catch {}
  }
  // quantos estão realmente assistindo minha tela (quem está longe/sem ver pede para pausar)
  _watchers() { let n = 0; for (const p of this.peers.values()) if (p.watch !== false) n++; return n; }
  _apply(p) {
    if (p.audioT) p.audioT.sender.replaceTrack(this.micTrack).catch(() => {});
    // som da tela só vai para quem está assistindo (igual ao vídeo)
    if (p.saudT) p.saudT.sender.replaceTrack(p.watch !== false ? this.screenAudioTrack : null).catch(() => {});
    if (p.videoT) {
      const sender = p.videoT.sender;
      sender.replaceTrack(this.screenTrack).catch(() => {});
      this._tuneVideo(p);
    }
  }
  // banda por pessoa: ~8 Mbps de envio total dividido entre quem assiste (entre 1,2 e 4 Mbps cada).
  // Quem não está assistindo não recebe nada (codificação pausada para essa pessoa).
  _tuneVideo(p) {
    if (!p.videoT) return;
    const sender = p.videoT.sender;
    try {
      const prm = sender.getParameters();
      if (!prm.encodings || !prm.encodings.length) return;
      const e = prm.encodings[0];
      const motion = this.screenMode === 'motion';
      const n = Math.max(1, this._watchers());
      const rate = Math.round(Math.min(motion ? 5e6 : 4e6, Math.max(1.2e6, 8e6 / n)));
      const active = p.watch !== false;
      const fps = motion ? 30 : 15;
      const deg = motion ? 'maintain-framerate' : 'maintain-resolution';
      if (e.maxBitrate === rate && e.active === active && e.maxFramerate === fps && prm.degradationPreference === deg) return;
      e.maxBitrate = rate; e.active = active; e.maxFramerate = fps;
      prm.degradationPreference = deg; // texto: mantém nitidez e baixa o fps; vídeo: o contrário
      sender.setParameters(prm).catch(() => {});
    } catch {}
  }
  _tuneAll() { for (const p of this.peers.values()) this._tuneVideo(p); }
  _onTrack(p, track, idx) {
    const stream = new MediaStream([track]);
    if (track.kind === 'audio' && idx === 2) {
      // som da tela: toca num <audio> próprio; o volume é ligado/desligado conforme você assiste (setScreenAudio)
      const el = new Audio(); el.srcObject = stream; el.autoplay = true; el.volume = 0;
      el.play().catch(() => {});
      p.screenAudioEl = el;
      return;
    }
    if (track.kind === 'audio') {
      if (p.nodes) return;
      // o Chrome só entrega áudio remoto ao WebAudio se o stream estiver num elemento <audio>
      const el = new Audio(); el.muted = true; el.srcObject = stream; el.play().catch(() => {});
      const src = this.ctx.createMediaStreamSource(stream);
      const panner = this.ctx.createPanner();
      panner.panningModel = 'HRTF'; panner.distanceModel = 'linear';
      panner.refDistance = 3; panner.maxDistance = 30; panner.rolloffFactor = 1;
      const an = this.ctx.createAnalyser(); an.fftSize = 512;
      // paredes: abafa (passa-baixa) e baixa o volume conforme o caminho do som
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 22000;
      const occ = this.ctx.createGain();
      src.connect(lp); lp.connect(occ); occ.connect(panner); panner.connect(this.master); src.connect(an);
      p.nodes = { el, src, panner, an, lp, occ, buf: new Uint8Array(an.fftSize) };
    } else if (track.kind === 'video') {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.autoplay = true; v.srcObject = stream;
      v.play().catch(() => {});
      p.videoEl = v; p.videoStream = stream;
      this.onVideo && this.onVideo(p.id, v);
    }
  }
  // posiciona o ouvinte (câmera) e as fontes (avatares); mode 'prox' ou 'global'
  update(camera, positions, mode, occlusion) {
    const l = this.ctx.listener, t = this.ctx.currentTime;
    const cp = camera.position;
    const fw = camera.getWorldDirection(_v);
    if (l.positionX) {
      l.positionX.setValueAtTime(cp.x, t); l.positionY.setValueAtTime(cp.y, t); l.positionZ.setValueAtTime(cp.z, t);
      l.forwardX.setValueAtTime(fw.x, t); l.forwardY.setValueAtTime(fw.y, t); l.forwardZ.setValueAtTime(fw.z, t);
      l.upX.setValueAtTime(0, t); l.upY.setValueAtTime(1, t); l.upZ.setValueAtTime(0, t);
    } else { l.setPosition(cp.x, cp.y, cp.z); l.setOrientation(fw.x, fw.y, fw.z, 0, 1, 0); }
    const doLevel = performance.now() - this.lastLevel > 120;
    if (doLevel) this.lastLevel = performance.now();
    for (const p of this.peers.values()) {
      if (!p.nodes) continue;
      const pos = mode === 'global' ? cp : positions.get(p.id);
      if (pos) {
        const pn = p.nodes.panner;
        if (pn.positionX) { pn.positionX.setValueAtTime(pos.x, t); pn.positionY.setValueAtTime(pos.y, t); pn.positionZ.setValueAtTime(pos.z, t); }
        else pn.setPosition(pos.x, pos.y, pos.z);
      }
      const o = occlusion && occlusion.get(p.id);
      const g = o ? o.occ : 1, f = o ? 22000 - o.muffle * 20800 : 22000;
      if (Math.abs(p.nodes.occ.gain.value - g) > 0.01) p.nodes.occ.gain.setTargetAtTime(g, t, 0.12);
      if (Math.abs(p.nodes.lp.frequency.value - f) > 50) p.nodes.lp.frequency.setTargetAtTime(f, t, 0.12);
      if (doLevel) {
        p.nodes.an.getByteTimeDomainData(p.nodes.buf);
        let s = 0; for (const v of p.nodes.buf) { const d = (v - 128) / 128; s += d * d; }
        const rms = Math.sqrt(s / p.nodes.buf.length);
        const speaking = p.speaking ? rms > 0.02 : rms > 0.035;
        if (speaking !== p.speaking) { p.speaking = speaking; this.onSpeaking && this.onSpeaking(p.id, speaking); }
      }
    }
  }
  // Microfone com redução de ruído em camadas:
  // 1) supressão de ruído/eco do próprio navegador (e isolamento de voz, se existir)
  // 2) filtro passa-alta 90 Hz (tira zumbido/vibração) e passa-baixa 7,5 kHz (chiado)
  // 3) compressor (nivela voz baixa/alta)
  // 4) portão de ruído: fica mudo enquanto você não fala
  async setMic(on) {
    if (on && !this.micTrack) {
      const sup = navigator.mediaDevices.getSupportedConstraints ? navigator.mediaDevices.getSupportedConstraints() : {};
      const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };
      if (sup.voiceIsolation) audio.voiceIsolation = true;
      const raw = await navigator.mediaDevices.getUserMedia({ audio });
      this.rawMic = raw.getAudioTracks()[0];
      const ctx = this.ctx;
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
      const src = ctx.createMediaStreamSource(raw);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 90; hp.Q.value = 0.7;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7500; lp.Q.value = 0.7;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -26; comp.knee.value = 12; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.2;
      const dst = ctx.createMediaStreamDestination();
      src.connect(hp); hp.connect(lp); lp.connect(comp);
      try {
        await ctx.audioWorklet.addModule('/js/gate-worklet.js');
        this.gate = new AudioWorkletNode(ctx, 'noise-gate', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
        this.gate.port.onmessage = e => { const s = !!e.data && this.micOn; if (s !== this.localSpeaking) { this.localSpeaking = s; this.onLocalSpeaking && this.onLocalSpeaking(s); } };
        this.setNoiseLevel(this.noiseLevel || 'normal');
        comp.connect(this.gate); this.gate.connect(dst);
      } catch (e) {
        console.warn('portão de ruído indisponível', e);
        comp.connect(dst);
      }
      this.micChain = { src, hp, lp, comp, dst };
      this.micTrack = dst.stream.getAudioTracks()[0];
      for (const p of this.peers.values()) this._apply(p);
    }
    if (this.micTrack) { this.micTrack.enabled = on; this.rawMic.enabled = on; }
    this.micOn = on && !!this.micTrack;
    if (!this.micOn && this.localSpeaking) { this.localSpeaking = false; this.onLocalSpeaking && this.onLocalSpeaking(false); }
    return this.micOn;
  }
  // 'off' | 'normal' | 'forte'
  setNoiseLevel(level) {
    this.noiseLevel = level;
    const th = { off: 0, normal: 0.012, forte: 0.03 }[level] ?? 0.012;
    if (this.gate) this.gate.parameters.get('threshold').setValueAtTime(th, this.ctx.currentTime);
  }
  // mode: 'text' (planilha, código, documento: nítido, até 15 qps) ou 'motion' (vídeo: fluido, até 30 qps)
  async startScreen(onEnded, mode) {
    this.screenMode = mode === 'motion' ? 'motion' : 'text';
    // resolução limitada: a tela no jogo pode ser enorme, mas o vídeo enviado continua leve.
    // selfBrowserSurface: esconde a própria aba do jogo da lista (compartilhar ela vira um espelho infinito).
    // áudio: aba do navegador manda o som da aba; tela inteira manda o som do computador
    // (restrictOwnAudio: não captura o som do próprio jogo, senão as vozes voltariam em eco)
    const s = await navigator.mediaDevices.getDisplayMedia({
      video: { width: { max: 1920 }, height: { max: 1080 }, frameRate: { ideal: 30, max: 30 } },
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, suppressLocalAudioPlayback: false },
      systemAudio: 'include', restrictOwnAudio: true, selfBrowserSurface: 'exclude', surfaceSwitching: 'include',
    });
    const tr = s.getVideoTracks()[0];
    tr.onended = () => { this.stopScreen(); onEnded && onEnded(); };
    this.screenTrack = tr;
    this.screenAudioTrack = s.getAudioTracks()[0] || null;
    this.setScreenMode(this.screenMode);
    for (const p of this.peers.values()) this._apply(p);
    return new MediaStream([tr]);
  }
  setScreenMode(mode) {
    this.screenMode = mode === 'motion' ? 'motion' : 'text';
    const tr = this.screenTrack;
    if (tr) {
      try { tr.contentHint = this.screenMode === 'motion' ? 'motion' : 'detail'; } catch {}
      tr.applyConstraints({ frameRate: { ideal: this.screenMode === 'motion' ? 30 : 15, max: 30 } }).catch(() => {});
    }
    this._tuneAll();
  }
  stopScreen() {
    if (!this.screenTrack) return;
    this.screenTrack.onended = null; this.screenTrack.stop(); this.screenTrack = null;
    if (this.screenAudioTrack) { this.screenAudioTrack.stop(); this.screenAudioTrack = null; }
    for (const p of this.peers.values()) this._apply(p);
  }
  videoStream(id) { const p = this.peers.get(id); return p ? p.videoStream : null; }
  // volume do som da tela de alguém (0 = mudo); suaviza para não estalar
  setScreenAudio(id, vol) {
    const p = this.peers.get(id);
    if (!p || !p.screenAudioEl) return;
    const el = p.screenAudioEl, v = Math.max(0, Math.min(1, vol));
    if (Math.abs(el.volume - v) > 0.01) el.volume = v;
    if (v > 0 && el.paused) el.play().catch(() => {});
  }
  get hasScreenAudio() { return !!this.screenAudioTrack; }
  remove(id) {
    const p = this.peers.get(id);
    if (!p) return;
    try { p.pc.close(); } catch {}
    if (p.nodes) { p.nodes.src.disconnect(); p.nodes.panner.disconnect(); p.nodes.el.srcObject = null; }
    if (p.screenAudioEl) { p.screenAudioEl.pause(); p.screenAudioEl.srcObject = null; }
    if (p.videoEl) p.videoEl.srcObject = null;
    this.peers.delete(id);
  }
}
const _v = new THREE.Vector3();

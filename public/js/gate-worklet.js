// Portão de ruído (noise gate) rodando na thread de áudio:
// abaixo do limiar o microfone fica mudo (corta teclado, ventilador, ruído de fundo),
// acima abre rápido e fecha devagar para não cortar o fim das palavras.
class NoiseGate extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'threshold', defaultValue: 0.012, minValue: 0, maxValue: 1, automationRate: 'k-rate' }];
  }
  constructor() {
    super();
    this.env = 0; this.gain = 0; this.hold = 0; this.talkHold = 0; this.open = false; this.count = 0;
  }
  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    if (!inp || !inp.length) return true;
    const th = params.threshold[0];
    const holdLen = sampleRate * 0.3;
    const ch0 = inp[0];
    for (let i = 0; i < ch0.length; i++) {
      const x = ch0[i];
      this.env += (x * x - this.env) * 0.003;
      const level = Math.sqrt(this.env);
      if (level > Math.max(th, 0.012)) this.talkHold = holdLen; else if (this.talkHold > 0) this.talkHold--;
      if (th <= 0 || level > th) { this.hold = holdLen; this.open = true; }
      else if (this.hold > 0) this.hold--;
      if (this.hold <= 0) this.open = false;
      const target = this.open ? 1 : 0;
      this.gain += (target - this.gain) * (target > this.gain ? 0.02 : 0.0006);
      for (let c = 0; c < out.length; c++) out[c][i] = (inp[c] || ch0)[i] * this.gain;
    }
    if ((this.count += ch0.length) > sampleRate / 10) { this.count = 0; this.port.postMessage(this.talkHold > 0 ? 1 : 0); }
    return true;
  }
}
registerProcessor('noise-gate', NoiseGate);

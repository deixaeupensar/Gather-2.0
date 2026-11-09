// WebSocket server mínimo (RFC 6455) sem dependências: texto, binário, ping/pong, close, fragmentação.
'use strict';
const crypto = require('crypto');
const { EventEmitter } = require('events');
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class Socket extends EventEmitter {
  constructor(sock, maxPayload) {
    super();
    this.sock = sock; this.maxPayload = maxPayload; this.readyState = 1;
    this.buf = Buffer.alloc(0); this.frag = null; this.fragOp = 0;
    sock.setNoDelay(true);
    sock.on('data', d => { this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d; try { this._parse(); } catch (e) { this.terminate(); } });
    sock.on('close', () => this._closed());
    sock.on('error', () => this._closed());
  }
  _closed() { if (this.readyState === 3) return; this.readyState = 3; this.emit('close'); }
  _parse() {
    while (this.buf.length >= 2) {
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0, op = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      if (len > this.maxPayload) throw new Error('payload grande demais');
      if (!masked) throw new Error('cliente deve mascarar');
      if (this.buf.length < off + 4 + len) return;
      const mask = this.buf.subarray(off, off + 4); off += 4;
      const data = Buffer.from(this.buf.subarray(off, off + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(off + len);
      if (op === 0x8) { this._send(0x8, data.subarray(0, 2)); this.sock.end(); this._closed(); return; }
      if (op === 0x9) { this._send(0xA, data); continue; }
      if (op === 0xA) { this.emit('pong'); continue; }
      if (op === 0x0) {
        if (!this.frag) throw new Error('continuação inesperada');
        this.frag.push(data);
        if (this.frag.reduce((s, b) => s + b.length, 0) > this.maxPayload) throw new Error('payload grande demais');
        if (fin) { const all = Buffer.concat(this.frag); this.frag = null; this.emit('message', all, this.fragOp === 0x2); }
        continue;
      }
      if (op === 0x1 || op === 0x2) {
        if (fin) this.emit('message', data, op === 0x2);
        else { this.frag = [data]; this.fragOp = op; }
        continue;
      }
      throw new Error('opcode desconhecido');
    }
  }
  _send(op, payload) {
    if (this.readyState !== 1) return;
    const len = payload.length;
    let head;
    if (len < 126) { head = Buffer.alloc(2); head[1] = len; }
    else if (len < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
    head[0] = 0x80 | op;
    this.sock.write(Buffer.concat([head, payload]));
  }
  send(data, opts) {
    const binary = (opts && opts.binary) || typeof data !== 'string';
    this._send(binary ? 0x2 : 0x1, typeof data === 'string' ? Buffer.from(data) : Buffer.from(data.buffer || data, data.byteOffset || 0, data.byteLength));
  }
  ping() { this._send(0x9, Buffer.alloc(0)); }
  terminate() { this.sock.destroy(); this._closed(); }
}

class WebSocketServer extends EventEmitter {
  constructor({ server, path, maxPayload = 1 << 20 }) {
    super();
    server.on('upgrade', (req, sock) => {
      const url = new URL(req.url, 'http://x');
      const key = req.headers['sec-websocket-key'];
      if (url.pathname !== path || !key || String(req.headers.upgrade).toLowerCase() !== 'websocket') { sock.destroy(); return; }
      const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
      sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
      this.emit('connection', new Socket(sock, maxPayload), req);
    });
  }
}
module.exports = { WebSocketServer };

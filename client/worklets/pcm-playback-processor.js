class PCMPlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(0);
    this.srcRate = 24000;
    this.port.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'append') {
        this.srcRate = msg.sampleRate || 24000;
        const int16 = this.base64ToInt16(msg.base64);
        const f32 = this.pcm16ToF32(int16);
        const up = this.resample(f32, this.srcRate, sampleRate);
        this.append(up);
      } else if (msg.type === 'flush') {
        this.buffer = new Float32Array(0);
      }
    };
  }

  static get parameterDescriptors() { return []; }

  append(chunk) {
    const out = new Float32Array(this.buffer.length + chunk.length);
    out.set(this.buffer, 0);
    out.set(chunk, this.buffer.length);
    this.buffer = out;
    this.postVU();
  }

  process(_, outputs) {
    const out = outputs[0][0];
    if (!out) return true;

    if (this.buffer.length >= out.length) {
      out.set(this.buffer.subarray(0, out.length));
      this.buffer = this.buffer.subarray(out.length);
    } else {
      out.fill(0);
    }
    this.postVU();
    return true;
  }

  postVU() {
    let rms = 0;
    const n = Math.min(this.buffer.length, 2048);
    for (let i = 0; i < n; i++) rms += this.buffer[i] * this.buffer[i];
    rms = Math.sqrt(rms / Math.max(1, n));
    this.port.postMessage({ type: 'vu', value: rms });
  }

  base64ToInt16(b64) {
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return new Int16Array(bytes.buffer);
  }

  pcm16ToF32(int16) {
    const f32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 0x8000;
    return f32;
  }

  resample(data, inRate, outRate) {
    if (inRate === outRate) return data;
    const ratio = inRate / outRate;
    const outLen = Math.floor(data.length / ratio);
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const idx = i * ratio;
      const i0 = Math.floor(idx);
      const i1 = Math.min(i0 + 1, data.length - 1);
      const frac = idx - i0;
      out[i] = data[i0] * (1 - frac) + data[i1] * frac;
    }
    return out;
  }
}

registerProcessor('pcm-playback-processor', PCMPlaybackProcessor);

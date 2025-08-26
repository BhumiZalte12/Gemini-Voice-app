class MicCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.inRate = sampleRate;
    this.outRate = 16000;
    this.buffer = [];
    this.port.onmessage = (e) => {
      if (e.data.type === 'stop') {
        this.buffer = [];
      }
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    this.buffer.push(...input[0]);

    const frameSizeIn = Math.floor(this.inRate * 0.03);
    while (this.buffer.length >= frameSizeIn) {
      const block = this.buffer.splice(0, frameSizeIn);
      const resampled = this.resample(block, this.inRate, this.outRate);
      const pcm16 = this.f32ToPcm16(resampled);
      const base64 = this.arrayBufferToBase64(pcm16.buffer);
      this.port.postMessage({ type: 'chunk', base64 });
    }
    return true;
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
      out[i] = data[i0] + (data[i1] - data[i0]) * (idx - i0);
    }
    return out;
  }

  f32ToPcm16(f32) {
    const out = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
      out[i] = Math.max(-32768, Math.min(32767, f32[i] * 32768));
    }
    return out;
  }

  arrayBufferToBase64(buf) {
    let binary = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}

registerProcessor('mic-capture-processor', MicCaptureProcessor);

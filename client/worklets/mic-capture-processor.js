class MicCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.inRate = sampleRate;
    this.outRate = (options?.processorOptions?.targetSampleRate) || 16000;
    this.buffer = [];
  }

  static get parameterDescriptors() { return []; }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const ch0 = input[0];
    if (!ch0) return true;
    this.buffer.push(...ch0);

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
    let pos = 0;
    for (let i = 0; i < outLen; i++) {
      const idx = i * ratio;
      const i0 = Math.floor(idx);
      const i1 = Math.min(i0 + 1, data.length - 1);
      const frac = idx - i0;
      out[i] = data[i0] * (1 - frac) + data[i1] * frac;
    }
    return out;
  }

  f32ToPcm16(f32) {
    const out = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
      let s = Math.max(-1, Math.min(1, f32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return out;
  }

  arrayBufferToBase64(buf) {
    let binary = '';
    const bytes = new Uint8Array(buf);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
}

registerProcessor('mic-capture-processor', MicCaptureProcessor);

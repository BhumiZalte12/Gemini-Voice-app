class PCMPlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(0);
    this.port.onmessage = (e) => {
      if (e.data.type === 'append') {
        const pcm16 = this.base64ToInt16(e.data.base64);
        const f32 = this.pcm16ToF32(pcm16);
        const upsampled = this.resample(f32, 24000, sampleRate);
        this.append(upsampled);
      } else if (e.data.type === 'flush') {
        this.buffer = new Float32Array(0);
      }
    };
  }

  append(chunk) {
    const newBuffer = new Float32Array(this.buffer.length + chunk.length);
    newBuffer.set(this.buffer, 0);
    newBuffer.set(chunk, this.buffer.length);
    this.buffer = newBuffer;
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
    return true;
  }

  base64ToInt16(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return new Int16Array(bytes.buffer);
  }

  pcm16ToF32(int16) {
    const f32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      f32[i] = int16[i] / 32768.0;
    }
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
      out[i] = data[i0] + (data[i1] - data[i0]) * (idx - i0);
    }
    return out;
  }
}

registerProcessor('pcm-playback-processor', PCMPlaybackProcessor);

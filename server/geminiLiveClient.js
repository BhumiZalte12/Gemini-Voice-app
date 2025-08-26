import WebSocket from 'ws';
import { decode as b64ToArrayBuffer, encode as arrayBufferToB64 } from 'base64-arraybuffer';

export class GeminiLiveClient {
  constructor({ url, model, systemPrompt }) {
    this.url = url;
    this.model = model;
    this.systemPrompt = systemPrompt;
    this.ws = null;
    this.ready = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url, { perMessageDeflate: false });

      this.ws.on('open', () => {
        const sessionCreate = {
          type: 'session.create',
          session: {
            model: this.model,
            response: {
              modalities: ['AUDIO'],
              audio_config: { encoding: 'LINEAR16_PCM', sample_rate_hz: 24000 }
            },
            instructions: this.systemPrompt
          }
        };
        this.ws.send(JSON.stringify(sessionCreate));
      });

      this.ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'session.created') {
            this.ready = true;
            resolve();
            return;
          }
          this.onEvent && this.onEvent(msg);
        } catch (e) {
          this.onBinary && this.onBinary(raw);
        }
      });

      this.ws.on('error', reject);
      this.ws.on('close', () => { this.ready = false; });
    });
  }

  sendAudioChunk(base64Chunk) {
    if (!this.ready) return;
    const event = {
      type: 'input_audio_buffer.append',
      audio: {
        mime_type: 'audio/pcm;rate=16000',
        data: base64Chunk
      }
    };
    this.ws.send(JSON.stringify(event));
  }

  commitUserUtterance() {
    if (!this.ready) return;
    this.ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
    this.ws.send(JSON.stringify({ type: 'response.create' }));
  }

  cancelResponse() {
    if (!this.ready) return;
    this.ws.send(JSON.stringify({ type: 'response.cancel' }));
  }

  close() {
    try { this.ws && this.ws.close(); } catch {}
  }
}

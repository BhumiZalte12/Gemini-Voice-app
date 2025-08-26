import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { GeminiLiveClient } from './geminiLiveClient.js';

const app = express();
const PORT = process.env.PORT || 8080;

const ALLOWED = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: (origin, cb) => cb(null, !origin || ALLOWED.includes(origin)) }));
app.use(express.static(path.join(process.cwd(), 'client')));

app.get('/healthz', (_, res) => res.json({ ok: true }));

const server = app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (browser) => {
  let gemini;
  let playing = false;

  const systemPrompt = fs.readFileSync(path.join(process.cwd(), 'server/systemPrompt.txt'), 'utf8');
  const url = (process.env.GEMINI_WS_URL || '').replace('${GOOGLE_API_KEY}', process.env.GOOGLE_API_KEY);
  gemini = new GeminiLiveClient({
    url,
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-preview-native-audio-dialog',
    systemPrompt
  });

  const sendToBrowser = (obj) => {
    try { browser.send(JSON.stringify(obj)); } catch {}
  };

  gemini.onEvent = (evt) => {
    if (evt.type === 'response.output_audio.delta') {
      playing = true;
      // evt.data should contain base64 audio chunk (depends on API)
      sendToBrowser({ type: 'audio_out', data: evt.data });
    } else if (evt.type === 'response.completed') {
      playing = false;
      sendToBrowser({ type: 'response_completed' });
    } else if (evt.type === 'response.interrupted') {
      playing = false;
      sendToBrowser({ type: 'response_interrupted' });
    } else {
      sendToBrowser(evt);
    }
  };

  gemini.connect().catch((e) => {
    sendToBrowser({ type: 'error', error: String(e) });
  });

  browser.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      switch (msg.type) {
        case 'client.audio_chunk': {
          gemini && gemini.sendAudioChunk(msg.data);
          break;
        }
        case 'client.commit': {
          gemini && gemini.commitUserUtterance();
          break;
        }
        case 'client.interrupt': {
          playing = false;
          gemini && gemini.cancelResponse();
          sendToBrowser({ type: 'response_interrupted' });
          break;
        }
      }
    } catch (e) {
      sendToBrowser({ type: 'error', error: String(e) });
    }
  });

  browser.on('close', () => {
    gemini && gemini.close();
  });
});

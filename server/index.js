import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { GeminiLiveClient } from './geminiLiveClient.js';

// --- API Key Check ---
// This block ensures the server stops if the API key is missing from your .env file.
if (!process.env.GOOGLE_API_KEY) {
  console.error("\n❌ ERROR: GOOGLE_API_KEY not found.");
  console.error("Please create a .env file in the root of your project and add your key:\n");
  console.error('GOOGLE_API_KEY="YOUR_API_KEY_HERE"\n');
  process.exit(1); // Stop the application
}

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors({ origin: process.env.CORS_ORIGINS || `http://localhost:${PORT}` }));
app.use(express.static(path.join(process.cwd(), 'client')));

const server = app.listen(PORT, () => console.log(`✅ Server is running on http://localhost:${PORT}`));

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (browser) => {
  console.log('🚀 Browser connected.');
  let gemini;

  const systemPrompt = fs.readFileSync(path.join(process.cwd(), 'server/systemPrompt.txt'), 'utf8');
  
  // This is the correct WebSocket URL for the Gemini Live API service.
  const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService/BidiGenerateContent?key=${process.env.GOOGLE_API_KEY}`;
  
  gemini = new GeminiLiveClient({
    url,
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-preview-native-audio-dialog',
    systemPrompt
  });

  const sendToBrowser = (obj) => {
    try { browser.send(JSON.stringify(obj)); } catch {}
  };

  gemini.onEvent = (evt) => {
    sendToBrowser(evt);
  };

  gemini.connect().catch((e) => {
    console.error("Fatal Gemini Connection Error:", e.message);
    sendToBrowser({ type: 'error', error: String(e.message) });
    browser.close();
  });

  browser.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      switch (msg.type) {
        case 'client.audio_chunk':
          gemini?.sendAudioChunk(msg.data);
          break;
        case 'client.commit':
          gemini?.commitUserUtterance();
          break;
        case 'client.interrupt':
          gemini?.cancelResponse();
          sendToBrowser({ type: 'response_interrupted' });
          break;
      }
    } catch (e) {
      sendToBrowser({ type: 'error', error: String(e) });
    }
  });

  browser.on('close', () => {
    console.log('🔴 Browser disconnected.');
    gemini?.close();
  });
});

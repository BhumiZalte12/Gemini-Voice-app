const logEl = document.getElementById('logs');
const btnConnect = document.getElementById('btnConnect');
const btnMic = document.getElementById('btnMic');
const btnStop = document.getElementById('btnStop');
const vu = document.getElementById('vu');
const modelSel = document.getElementById('model');
const langInput = document.getElementById('lang');

let ws;
let ctx;
let micNode;
let captureNode;
let playbackNode;
let speaking = false;

function log(msg) {
  const time = new Date().toLocaleTimeString();
  logEl.innerHTML = `<div>[${time}] ${msg}</div>` + logEl.innerHTML;
}

async function setupAudio() {
  ctx = new AudioContext({ sampleRate: 48000 });
  await ctx.audioWorklet.addModule('./worklets/mic-capture-processor.js');
  await ctx.audioWorklet.addModule('./worklets/pcm-playback-processor.js');

  playbackNode = new AudioWorkletNode(ctx, 'pcm-playback-processor');
  playbackNode.connect(ctx.destination);

  playbackNode.port.onmessage = (e) => {
    if (e.data?.type === 'vu') {
      vu.style.width = Math.min(100, Math.max(0, e.data.value * 100)) + '%';
    }
  };
}

async function startMic() {
  await setupAudio();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  micNode = new MediaStreamAudioSourceNode(ctx, { mediaStream: stream });
  captureNode = new AudioWorkletNode(ctx, 'mic-capture-processor', {
    processorOptions: { targetSampleRate: 16000 }
  });
  micNode.connect(captureNode);

  captureNode.port.onmessage = (e) => {
    if (e.data?.type === 'chunk') {
      ws?.send(JSON.stringify({ type: 'client.audio_chunk', data: e.data.base64 }));
    }
  };
}

function commitUtterance() {
  ws?.send(JSON.stringify({ type: 'client.commit' }));
}

function interrupt() {
  ws?.send(JSON.stringify({ type: 'client.interrupt' }));
  speaking = false;
}

btnConnect.onclick = async () => {
  const url = `${location.origin.replace('http', 'ws')}/ws`;
  ws = new WebSocket(url);
  ws.onopen = () => {
    log('Connected to Node proxy. Hold and speak.');
    btnMic.disabled = false; btnStop.disabled = false; btnConnect.disabled = true;
  };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'audio_out') {
        speaking = true;
        playbackNode.port.postMessage({ type: 'append', base64: msg.data, sampleRate: 24000 });
      } else if (msg.type === 'response_completed' || msg.type === 'response_interrupted') {
        speaking = false;
        playbackNode.port.postMessage({ type: 'flush' });
      } else if (msg.type === 'error') {
        log('Error: ' + msg.error);
      } else if (msg.type) {
        log(msg.type);
      }
    } catch (e) {
      log('non-json message');
    }
  };
  ws.onclose = () => log('WS closed');
};

btnMic.onmousedown = async () => {
  if (!ctx || ctx.state !== 'running') await startMic();
};
btnMic.onmouseup = () => commitUtterance();
btnMic.onmouseleave = () => commitUtterance();

btnStop.onclick = () => {
  interrupt();
};

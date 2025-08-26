const micButton = document.getElementById('micButton');
const statusElement = document.getElementById('status');
const logsElement = document.getElementById('logs');

let ws;
let audioContext;
let micNode;
let playbackNode;
let isSpeaking = false;
let isRecording = false;

function log(message) {
  console.log(message);
  const p = document.createElement('p');
  p.textContent = `> ${message}`;
  logsElement.insertBefore(p, logsElement.firstChild);
}

async function connect() {
  log('Connecting to server...');
  const url = `${location.origin.replace('http', 'ws')}/ws`;
  ws = new WebSocket(url);

  ws.onopen = () => {
    log('✅ Connected. Hold the button to talk.');
    micButton.disabled = false;
  };
  ws.onclose = () => log('❌ Disconnected.');
  ws.onerror = () => log('Error connecting to server.');

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    switch (msg.type) {
      case 'response.output_audio.delta':
        isSpeaking = true;
        updateUIMode('speaking');
        playbackNode?.port.postMessage({ type: 'append', base64: msg.data });
        break;
      case 'response.completed':
      case 'response.interrupted':
        isSpeaking = false;
        playbackNode?.port.postMessage({ type: 'flush' });
        if (!isRecording) updateUIMode('idle');
        break;
      case 'error':
        log(`Error: ${msg.error}`);
        break;
    }
  };
}

async function setupAudio() {
  if (audioContext) return;
  audioContext = new AudioContext({ sampleRate: 48000 });
  // You must have the worklet files in the `client/worklets` directory
  await audioContext.audioWorklet.addModule('./worklets/mic-capture-processor.js');
  await audioContext.audioWorklet.addModule('./worklets/pcm-playback-processor.js');

  playbackNode = new AudioWorkletNode(audioContext, 'pcm-playback-processor');
  playbackNode.connect(audioContext.destination);
}

async function startMic() {
  if (isRecording) return;
  isRecording = true;
  await setupAudio();
  // Ensure audio context is running
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  if (isSpeaking) {
    log("🎤 Interrupting AI...");
    ws?.send(JSON.stringify({ type: 'client.interrupt' }));
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  micNode = new AudioWorkletNode(audioContext, 'mic-capture-processor');
  const mediaStreamSource = audioContext.createMediaStreamSource(stream);
  mediaStreamSource.connect(micNode);

  micNode.port.onmessage = (e) => {
    if (e.data?.type === 'chunk') {
      ws?.send(JSON.stringify({ type: 'client.audio_chunk', data: e.data.base64 }));
    }
  };
  updateUIMode('listening');
}

function stopMic() {
  if (!isRecording) return;
  isRecording = false;
  micNode?.port.postMessage({ type: 'stop' });
  micNode?.disconnect();
  ws?.send(JSON.stringify({ type: 'client.commit' }));
  if (!isSpeaking) updateUIMode('processing');
}

function updateUIMode(mode) {
  micButton.classList.remove('pulse-ring', 'bg-red-600', 'bg-blue-600', 'bg-gray-500');
  switch (mode) {
    case 'listening':
      statusElement.textContent = 'Listening...';
      micButton.classList.add('bg-red-600', 'pulse-ring');
      break;
    case 'speaking':
      statusElement.textContent = 'Rev is speaking...';
      micButton.classList.add('bg-gray-500');
      break;
    case 'processing':
      statusElement.textContent = 'Thinking...';
      micButton.classList.add('bg-gray-500');
      break;
    case 'idle':
    default:
      statusElement.textContent = 'Press and hold the icon to speak';
      micButton.classList.add('bg-blue-600');
      break;
  }
}

micButton.onmousedown = startMic;
micButton.onmouseup = stopMic;
micButton.onmouseleave = stopMic; 

micButton.disabled = true;
connect();

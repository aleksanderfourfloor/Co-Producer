import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const maxApi = require('max-api');
const { WebSocket } = require('ws');

const BRIDGE_URL = 'ws://127.0.0.1:49741';
let socket;
let reconnectTimer;

function log(message) {
  maxApi.post(`[Co-Producer Bridge] ${message}`);
}

function encodePayload(value) {
  return encodeURIComponent(JSON.stringify(value));
}

function decodePayload(payload) {
  return JSON.parse(decodeURIComponent(payload));
}

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    socket = new WebSocket(BRIDGE_URL);
  } catch (error) {
    log(`Failed to create WebSocket client: ${error.message}`);
    scheduleReconnect();
    return;
  }

  socket.addEventListener('open', () => {
    clearReconnect();
    socket.send(
      JSON.stringify({
        type: 'bridge:hello',
        bridgeId: 'max-for-live',
        version: '0.1.0',
        capabilities: ['snapshot', 'analysis', 'commands']
      })
    );
    log('Connected to desktop bridge.');
  });

  socket.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(event.data);
      switch (message.type) {
        case 'snapshot:request':
          log('Snapshot request received from desktop.');
          maxApi.outlet('snapshot_request');
          break;
        case 'analysis:request':
          log(`Analysis request received for ${message.request?.target ?? 'unknown target'}.`);
          maxApi.outlet('analysis_request', encodePayload(message.request));
          break;
        case 'command:batch':
          log(`Command batch received: ${message.plan?.id ?? 'unknown plan'}.`);
          maxApi.outlet('command_batch', encodePayload(message.plan));
          break;
        case 'self_test:request':
          log(`Bridge self-test requested: ${message.planId}.`);
          maxApi.outlet('self_test_request', message.planId);
          break;
      }
    } catch (error) {
      log(`Failed to parse message: ${error.message}`);
    }
  });

  socket.addEventListener('close', () => {
    log('Disconnected from desktop bridge.');
    socket = undefined;
    scheduleReconnect();
  });

  socket.addEventListener('error', (event) => {
    log(`Socket error: ${event.message ?? 'unknown error'}`);
  });
}

function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
}

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    connect();
  }, 2000);
}

function sendMessage(message) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    log('Bridge is offline; dropping message.');
    return;
  }

  socket.send(JSON.stringify(message));
}

maxApi.addHandler('connect', () => {
  connect();
});

maxApi.addHandler('snapshot', (payload) => {
  sendMessage({
    type: 'snapshot:update',
    snapshot: decodePayload(payload)
  });
});

maxApi.addHandler('analysis_result', (payload) => {
  const parsed = decodePayload(payload);
  sendMessage({
    type: 'analysis:result',
    ...parsed
  });
});

maxApi.addHandler('command_result', (payload) => {
  sendMessage({
    type: 'command:result',
    result: decodePayload(payload)
  });
});

maxApi.addHandler('command_started', (payload) => {
  sendMessage({
    type: 'command:started',
    ...decodePayload(payload)
  });
});

maxApi.addHandler('command_step_result', (payload) => {
  sendMessage({
    type: 'command:step_result',
    ...decodePayload(payload)
  });
});

maxApi.addHandler('bridge_error', (payload) => {
  sendMessage({
    type: 'bridge:error',
    ...decodePayload(payload)
  });
});

connect();

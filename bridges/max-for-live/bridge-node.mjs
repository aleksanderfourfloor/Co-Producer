const maxApi = require('max-api');

const BRIDGE_URL = 'ws://127.0.0.1:49741';
let socket;
let reconnectTimer;

function connect() {
  try {
    socket = new WebSocket(BRIDGE_URL);
  } catch (error) {
    maxApi.post(`Co-Producer bridge failed to create WebSocket client: ${error.message}`);
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
    maxApi.post('Co-Producer bridge connected.');
  });

  socket.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(event.data);
      switch (message.type) {
        case 'snapshot:request':
          maxApi.outlet('snapshot_request');
          break;
        case 'analysis:request':
          maxApi.outlet('analysis_request', JSON.stringify(message.request));
          break;
        case 'command:batch':
          maxApi.outlet('command_batch', JSON.stringify(message.plan));
          break;
      }
    } catch (error) {
      maxApi.post(`Co-Producer bridge failed to parse message: ${error.message}`);
    }
  });

  socket.addEventListener('close', () => {
    maxApi.post('Co-Producer bridge disconnected.');
    scheduleReconnect();
  });

  socket.addEventListener('error', (event) => {
    maxApi.post(`Co-Producer bridge socket error: ${event.message ?? 'unknown error'}`);
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
    maxApi.post('Co-Producer bridge is offline; dropping message.');
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
    snapshot: JSON.parse(payload)
  });
});

maxApi.addHandler('analysis_result', (payload) => {
  const parsed = JSON.parse(payload);
  sendMessage({
    type: 'analysis:result',
    ...parsed
  });
});

maxApi.addHandler('command_result', (payload) => {
  sendMessage({
    type: 'command:result',
    result: JSON.parse(payload)
  });
});

maxApi.addHandler('bridge_error', (payload) => {
  sendMessage({
    type: 'bridge:error',
    ...JSON.parse(payload)
  });
});

connect();

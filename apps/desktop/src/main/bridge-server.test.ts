import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import type { ActionPlan } from '@shared/types';
import { BridgeServer } from './bridge-server';

const plan: ActionPlan = {
  id: 'plan-bridge-server-test',
  title: 'Bridge server execution',
  summary: 'Verify command telemetry handling.',
  rationale: 'The bridge server should expose per-step execution updates.',
  createdAt: new Date().toISOString(),
  snapshotRevision: 'rev-bridge-server-test',
  commands: [
    {
      type: 'create_midi_track',
      trackName: 'Bridge Server Test',
      insertIndex: 0
    }
  ]
};

test('bridge server forwards step telemetry and resolves the execution result', async (t) => {
  const port = 50000 + Math.floor(Math.random() * 10000);
  const server = new BridgeServer();
  server.start(port);
  t.after(() => {
    server.stop();
  });

  const startedMessages: string[] = [];
  const stepMessages: string[] = [];
  server.on('commandStarted', (message) => {
    startedMessages.push(message.message);
  });
  server.on('commandStep', (message) => {
    stepMessages.push(message.message);
  });

  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  t.after(() => {
    socket.close();
  });

  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });

  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.type !== 'command:batch') {
      return;
    }

    socket.send(
      JSON.stringify({
        type: 'command:started',
        planId: plan.id,
        source: 'apply',
        commandCount: 1,
        message: 'Bridge received 1 command for execution.'
      })
    );
    socket.send(
      JSON.stringify({
        type: 'command:step_result',
        planId: plan.id,
        commandIndex: 0,
        commandType: 'create_midi_track',
        ok: true,
        message: 'Created MIDI track at index 0.',
        command: plan.commands[0]
      })
    );
    socket.send(
      JSON.stringify({
        type: 'command:result',
        result: {
          planId: plan.id,
          accepted: true,
          message: 'Executed 1 command(s) in Ableton Live.',
          executedCommandIndexes: [0]
        }
      })
    );
  });

  const result = await server.executePlan(plan);

  assert.equal(result.accepted, true);
  assert.deepEqual(startedMessages, ['Bridge received 1 command for execution.']);
  assert.deepEqual(stepMessages, ['Created MIDI track at index 0.']);
});

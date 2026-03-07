import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import type { ActionPlan, ApplyPlanRequest, ContextSnapshot } from '@shared/types';
import { mockSnapshot } from '@shared/mock-data';
import { DesktopController } from './controller';

function createPlan(snapshotRevision: string): ActionPlan {
  return {
    id: 'plan-test-1',
    title: 'Create test track',
    summary: 'Simple bridge execution test.',
    rationale: 'Exercise the bridge apply path.',
    createdAt: new Date().toISOString(),
    snapshotRevision,
    commands: [
      {
        type: 'create_midi_track',
        trackName: 'Test Track',
        insertIndex: 1
      }
    ]
  };
}

async function connectBridge(controller: DesktopController, port: number, snapshot?: Partial<ContextSnapshot>) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);

  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });

  socket.send(
    JSON.stringify({
      type: 'bridge:hello',
      bridgeId: 'test-bridge',
      version: '0.1.0-test',
      capabilities: ['snapshot', 'analysis', 'commands']
    })
  );

  await delay(20);

  socket.send(
    JSON.stringify({
      type: 'snapshot:update',
      snapshot: {
        ...mockSnapshot,
        id: 'snapshot-test-1',
        setRevision: 'rev-test-1',
        ...snapshot
      }
    })
  );

  await delay(50);
  return socket;
}

function addPlanToController(controller: DesktopController, plan: ActionPlan): void {
  (controller as unknown as { store: { addPlan: (nextPlan: ActionPlan) => void } }).store.addPlan(plan);
}

function createApplyRequest(plan: ActionPlan): ApplyPlanRequest {
  return {
    planId: plan.id,
    snapshotRevision: plan.snapshotRevision,
    selectedCommandIndexes: [0]
  };
}

test('desktop controller switches to connected mode when a bridge client connects', async (t) => {
  const port = 50000 + Math.floor(Math.random() * 10000);
  const controller = new DesktopController(undefined, port);
  controller.start();
  t.after(() => {
    controller.stop();
  });

  const socket = await connectBridge(controller, port);
  t.after(() => {
    socket.close();
  });

  const state = controller.getState();
  assert.equal(state.bridgeStatus, 'connected');
  assert.equal(state.bridgeVersion, '0.1.0-test');
  assert.equal(state.snapshot.setRevision, 'rev-test-1');
});

test('desktop controller records a successful bridge apply with step telemetry and snapshot confirmation', async (t) => {
  const port = 50000 + Math.floor(Math.random() * 10000);
  const controller = new DesktopController(undefined, port);
  controller.start();
  t.after(() => {
    controller.stop();
  });

  const socket = await connectBridge(controller, port);
  t.after(() => {
    socket.close();
  });

  const plan = createPlan('rev-test-1');
  addPlanToController(controller, plan);

  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.type === 'command:batch') {
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
          message: 'Created MIDI track at index 1.',
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
      return;
    }

    if (message.type === 'snapshot:request') {
      socket.send(
        JSON.stringify({
          type: 'snapshot:update',
          snapshot: {
            ...mockSnapshot,
            id: 'snapshot-test-2',
            setRevision: 'rev-test-2'
          }
        })
      );
    }
  });

  const result = await controller.applyPlan(createApplyRequest(plan));
  const state = controller.getState();

  assert.equal(result.accepted, true);
  assert.equal(result.snapshotConfirmed, true);
  assert.equal(state.bridgeStatus, 'connected');
  assert.equal(state.pendingPlans.length, 0);
  assert.equal(state.lastExecution?.status, 'succeeded');
  assert.ok(state.lastExecution?.entries.some((entry) => entry.kind === 'step' && entry.ok === true));
  assert.ok(state.lastExecution?.entries.some((entry) => entry.kind === 'snapshot'));
});

test('desktop controller surfaces a failed bridge step and preserves the pending plan', async (t) => {
  const port = 50000 + Math.floor(Math.random() * 10000);
  const controller = new DesktopController(undefined, port);
  controller.start();
  t.after(() => {
    controller.stop();
  });

  const socket = await connectBridge(controller, port);
  t.after(() => {
    socket.close();
  });

  const plan = createPlan('rev-test-1');
  addPlanToController(controller, plan);

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
        ok: false,
        message: 'Track creation failed.',
        command: plan.commands[0]
      })
    );
    socket.send(
      JSON.stringify({
        type: 'bridge:error',
        message: 'Track creation failed.',
        planId: plan.id,
        commandIndex: 0,
        commandType: 'create_midi_track',
        code: 'command_step_failed'
      })
    );
    socket.send(
      JSON.stringify({
        type: 'command:result',
        result: {
          planId: plan.id,
          accepted: false,
          message: 'Track creation failed.',
          executedCommandIndexes: [],
          failedCommandIndex: 0,
          failedCommandType: 'create_midi_track'
        }
      })
    );
  });

  const result = await controller.applyPlan(createApplyRequest(plan));
  const state = controller.getState();

  assert.equal(result.accepted, false);
  assert.equal(state.bridgeStatus, 'error');
  assert.equal(state.pendingPlans.length, 1);
  assert.equal(state.lastExecution?.status, 'failed');
  assert.equal(state.lastExecution?.entries.some((entry) => entry.kind === 'error'), true);
  assert.match(state.lastError ?? '', /track creation failed/i);
});

test('desktop controller marks bridge success without a fresh snapshot as suspect', async (t) => {
  const port = 50000 + Math.floor(Math.random() * 10000);
  const controller = new DesktopController(undefined, port);
  controller.start();
  t.after(() => {
    controller.stop();
  });

  const socket = await connectBridge(controller, port);
  t.after(() => {
    socket.close();
  });

  const plan = createPlan('rev-test-1');
  addPlanToController(controller, plan);

  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.type === 'command:batch') {
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
          message: 'Created MIDI track at index 1.',
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
      return;
    }

    if (message.type === 'snapshot:request') {
      socket.send(
        JSON.stringify({
          type: 'snapshot:update',
          snapshot: {
            ...mockSnapshot,
            id: 'snapshot-test-3',
            setRevision: 'rev-test-1'
          }
        })
      );
    }
  });

  const result = await controller.applyPlan(createApplyRequest(plan));
  const state = controller.getState();

  assert.equal(result.accepted, true);
  assert.equal(result.suspect, true);
  assert.equal(result.snapshotConfirmed, false);
  assert.equal(state.lastExecution?.status, 'suspect');
  assert.match(state.lastError ?? '', /did not receive a confirming snapshot change/i);
});

test('desktop controller returns a visible failure when bridge dispatch throws before execution starts', async () => {
  const controller = new DesktopController(undefined, 59999);
  const plan = createPlan(mockSnapshot.setRevision);
  addPlanToController(controller, plan);

  const internalController = controller as unknown as {
    bridgeServer: {
      isConnected: () => boolean;
      executePlan: () => Promise<never>;
    };
  };

  internalController.bridgeServer.isConnected = () => true;
  internalController.bridgeServer.executePlan = async () => {
    throw new Error('Ableton bridge is not connected.');
  };

  const result = await controller.applyPlan(createApplyRequest(plan));
  const state = controller.getState();

  assert.equal(result.accepted, false);
  assert.match(result.message, /ableton bridge is not connected/i);
  assert.equal(state.bridgeStatus, 'error');
  assert.equal(state.lastExecution?.status, 'failed');
});

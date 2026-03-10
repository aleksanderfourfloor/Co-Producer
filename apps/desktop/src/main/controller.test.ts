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

async function connectBridge(
  controller: DesktopController,
  port: number,
  options?: {
    snapshot?: Partial<ContextSnapshot>;
    hello?: {
      bridgeKind?: 'max_for_live' | 'control_surface';
      capabilities?: string[];
      authoritativeWrite?: boolean;
    };
  }
) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);

  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });

  socket.send(
    JSON.stringify({
      type: 'bridge:hello',
      bridgeId: 'test-bridge',
      bridgeKind: options?.hello?.bridgeKind ?? 'max_for_live',
      version: '0.1.0-test',
      capabilities: options?.hello?.capabilities ?? ['snapshot', 'analysis', 'commands'],
      authoritativeWrite: options?.hello?.authoritativeWrite ?? false
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
        ...options?.snapshot
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

  const socket = await connectBridge(controller, port, {
    hello: {
      bridgeKind: 'control_surface',
      capabilities: ['snapshot', 'analysis', 'commands', 'authoritative_write'],
      authoritativeWrite: true
    }
  });
  t.after(() => {
    socket.close();
  });

  const state = controller.getState();
  assert.equal(state.bridgeStatus, 'connected');
  assert.equal(state.bridgeKind, 'control_surface');
  assert.equal(state.bridgeMaturity, 'preferred');
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

  const socket = await connectBridge(controller, port, {
    hello: {
      bridgeKind: 'control_surface',
      capabilities: ['snapshot', 'analysis', 'commands', 'authoritative_write'],
      authoritativeWrite: true
    }
  });
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

  const socket = await connectBridge(controller, port, {
    hello: {
      bridgeKind: 'control_surface',
      capabilities: ['snapshot', 'analysis', 'commands', 'authoritative_write'],
      authoritativeWrite: true
    }
  });
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

  const socket = await connectBridge(controller, port, {
    hello: {
      bridgeKind: 'control_surface',
      capabilities: ['snapshot', 'analysis', 'commands', 'authoritative_write'],
      authoritativeWrite: true
    }
  });
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
    store: {
      setBridgeStatus: (
        status: 'connected',
        update: {
          bridgeKind: 'control_surface';
          bridgeMaturity: 'preferred';
          bridgeCapabilities: ['commands', 'authoritative_write'];
          bridgeAuthoritative: true;
        }
      ) => void;
    };
  };

  internalController.bridgeServer.isConnected = () => true;
  internalController.bridgeServer.executePlan = async () => {
    throw new Error('Ableton bridge is not connected.');
  };
  internalController.store.setBridgeStatus('connected', {
    bridgeKind: 'control_surface',
    bridgeMaturity: 'preferred',
    bridgeCapabilities: ['commands', 'authoritative_write'],
    bridgeAuthoritative: true
  });

  const result = await controller.applyPlan(createApplyRequest(plan));
  const state = controller.getState();

  assert.equal(result.accepted, false);
  assert.match(result.message, /ableton bridge is not connected/i);
  assert.equal(state.bridgeStatus, 'error');
  assert.equal(state.lastExecution?.status, 'failed');
});

test('desktop controller blocks live apply on a non-authoritative bridge', async (t) => {
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

  const result = await controller.applyPlan(createApplyRequest(plan));
  const state = controller.getState();

  assert.equal(result.accepted, false);
  assert.match(result.message, /run bridge self-test successfully/i);
  assert.equal(state.pendingPlans.length, 1);
  assert.equal(state.lastExecution, undefined);
  assert.match(state.lastError ?? '', /self-test successfully/i);
});

test('desktop controller allows live apply on max bridge after successful self-test', async (t) => {
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

  const initialState = controller.getState();
  const selfTestRevisionBefore = initialState.snapshot.setRevision;
  const selfTestRevisionAfter = `${selfTestRevisionBefore}-self-test`;
  const applyRevisionAfter = `${selfTestRevisionAfter}-apply`;
  let snapshotPhase: 'self-test' | 'apply' = 'self-test';

  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString());

    if (message.type === 'self_test:request') {
      socket.send(
        JSON.stringify({
          type: 'command:started',
          planId: message.planId,
          source: 'self_test',
          commandCount: 2,
          message: 'Bridge received 2 command(s) for execution.'
        })
      );
      socket.send(
        JSON.stringify({
          type: 'command:result',
          result: {
            planId: message.planId,
            accepted: true,
            message: 'Executed 2 command(s) in Ableton Live.',
            executedCommandIndexes: [0, 1]
          }
        })
      );
      return;
    }

    if (message.type === 'command:batch') {
      snapshotPhase = 'apply';
      socket.send(
        JSON.stringify({
          type: 'command:started',
          planId: message.plan.id,
          source: 'apply',
          commandCount: message.plan.commands.length,
          message: `Bridge received ${message.plan.commands.length} command(s) for execution.`
        })
      );
      socket.send(
        JSON.stringify({
          type: 'command:step_result',
          planId: message.plan.id,
          commandIndex: 0,
          commandType: 'create_midi_track',
          ok: true,
          message: 'Created MIDI track at index 1.',
          command: message.plan.commands[0]
        })
      );
      socket.send(
        JSON.stringify({
          type: 'command:result',
          result: {
            planId: message.plan.id,
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
            id: snapshotPhase === 'self-test' ? 'snapshot-self-test' : 'snapshot-after-apply',
            setRevision: snapshotPhase === 'self-test' ? selfTestRevisionAfter : applyRevisionAfter
          }
        })
      );
    }
  });

  const selfTestResult = await controller.runBridgeSelfTest();
  assert.equal(selfTestResult.accepted, true);
  assert.equal(selfTestResult.snapshotConfirmed, true);

  const plan = createPlan(selfTestRevisionAfter);
  addPlanToController(controller, plan);

  const applyResult = await controller.applyPlan(createApplyRequest(plan));
  const state = controller.getState();

  assert.equal(applyResult.accepted, true);
  assert.equal(state.lastExecution?.mode, 'bridge');
  assert.equal(state.lastExecution?.status, 'succeeded');
  assert.equal(state.pendingPlans.length, 0);
});

test('desktop controller blocks apply while Ableton bridge is disconnected', async () => {
  const controller = new DesktopController(undefined, 59998);
  const plan = createPlan(mockSnapshot.setRevision);
  addPlanToController(controller, plan);

  const result = await controller.applyPlan(createApplyRequest(plan));
  const state = controller.getState();

  assert.equal(result.accepted, false);
  assert.match(result.message, /ableton is disconnected/i);
  assert.equal(state.pendingPlans.length, 1);
  assert.match(state.lastError ?? '', /ableton is disconnected/i);
});

test('desktop controller generates a direct audio-track plan from explicit prompt', async () => {
  const controller = new DesktopController(undefined, 59997);

  const state = await controller.sendMessage('create a new audio track and call it kick');
  const plan = state.pendingPlans.at(-1);

  assert.ok(plan);
  assert.equal(plan?.commands.length, 1);
  assert.equal(plan?.commands[0]?.type, 'create_audio_track');
  if (plan?.commands[0]?.type === 'create_audio_track') {
    assert.match(plan.commands[0].trackName, /kick/i);
  }
});

test('desktop controller chat guidance says apply is blocked while disconnected', async () => {
  const controller = new DesktopController(undefined, 59996);

  const state = await controller.sendMessage('create a new audio track and call it kick');
  const assistant = state.chat.at(-1);

  assert.equal(assistant?.role, 'assistant');
  assert.match(assistant?.content ?? '', /applying is blocked until reconnection/i);
  assert.doesNotMatch(assistant?.content ?? '', /mock session/i);
});

test('desktop controller auto-applies explicit track creation prompt when live apply is enabled', async (t) => {
  const port = 50000 + Math.floor(Math.random() * 10000);
  const controller = new DesktopController(undefined, port);
  controller.start();
  t.after(() => {
    controller.stop();
  });

  const socket = await connectBridge(controller, port, {
    hello: {
      bridgeKind: 'control_surface',
      capabilities: ['snapshot', 'analysis', 'commands', 'authoritative_write'],
      authoritativeWrite: true
    }
  });
  t.after(() => {
    socket.close();
  });

  let applied = false;

  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString());

    if (message.type === 'command:batch') {
      applied = true;
      socket.send(
        JSON.stringify({
          type: 'command:started',
          planId: message.plan.id,
          source: 'apply',
          commandCount: 1,
          message: 'Bridge received 1 command for execution.'
        })
      );
      socket.send(
        JSON.stringify({
          type: 'command:step_result',
          planId: message.plan.id,
          commandIndex: 0,
          commandType: 'create_audio_track',
          ok: true,
          message: 'Created audio track at index 1.',
          command: message.plan.commands[0]
        })
      );
      socket.send(
        JSON.stringify({
          type: 'command:result',
          result: {
            planId: message.plan.id,
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
            id: applied ? 'snapshot-after-auto-apply' : 'snapshot-before-auto-apply',
            setRevision: applied ? 'rev-auto-apply' : 'rev-test-1'
          }
        })
      );
    }
  });

  const state = await controller.sendMessage('create a new audio track and call it kick');

  assert.equal(state.pendingPlans.length, 0);
  assert.equal(state.lastExecution?.status, 'succeeded');
  assert.equal(state.lastExecution?.mode, 'bridge');
  assert.ok(state.lastExecution?.entries.some((entry) => entry.commandType === 'create_audio_track' && entry.ok === true));
});

test('desktop controller marks reconnecting state after bridge disconnect', async (t) => {
  const port = 50000 + Math.floor(Math.random() * 10000);
  const controller = new DesktopController(undefined, port);
  controller.start();
  t.after(() => {
    controller.stop();
  });

  const socket = await connectBridge(controller, port);
  socket.close();
  await delay(50);

  const state = controller.getState();
  assert.equal(state.bridgeStatus, 'waiting');
  assert.equal(state.bridgeKind, 'max_for_live');
  assert.match(state.lastError ?? '', /reconnecting/i);
});

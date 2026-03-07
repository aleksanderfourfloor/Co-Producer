import test from 'node:test';
import assert from 'node:assert/strict';
import { mockReferences, mockSnapshot } from '@shared/index';
import { createConversationResponse } from './planner';
import { validateApplyPlanRequest } from './plan-guards';

test('arrangement advice references actual session structure', () => {
  const response = createConversationResponse({
    message: 'Give me arrangement advice',
    snapshot: mockSnapshot,
    references: mockReferences
  });

  assert.match(response.reply, /128 BPM/);
  assert.match(response.reply, /Kick/);
  assert.match(response.reply, /Intro -> Drop -> Break/);
});

test('track-generation request returns grouped Ableton commands', () => {
  const response = createConversationResponse({
    message: 'Add an 8 bar bass idea with some saturation',
    snapshot: mockSnapshot,
    references: []
  });

  assert.ok(response.plan);
  assert.equal(response.plan?.commands[0]?.type, 'create_midi_track');
  assert.ok(response.plan?.commands.some((command) => command.type === 'replace_clip_notes'));
  assert.ok(response.plan?.commands.some((command) => command.type === 'insert_native_device'));
});

test('stale plan requests are rejected', () => {
  const response = createConversationResponse({
    message: 'Add a pad',
    snapshot: mockSnapshot,
    references: []
  });

  assert.ok(response.plan);

  const validation = validateApplyPlanRequest(
    {
      planId: response.plan!.id,
      snapshotRevision: 'rev-other',
      selectedCommandIndexes: [0, 1]
    },
    mockSnapshot.setRevision,
    [response.plan!]
  );

  assert.equal(validation.result.accepted, false);
  assert.match(validation.result.message, /set changed/i);
});

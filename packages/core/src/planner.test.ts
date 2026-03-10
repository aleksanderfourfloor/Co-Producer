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

  assert.match(response.reply, /Current focus is Pad/i);
  assert.match(response.reply, /Write a 8-bar idea directly on Pad/i);
  assert.ok(response.plan);
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

test('selected-track request writes directly onto the selected track', () => {
  const response = createConversationResponse({
    message: 'Write an 8 bar pad idea on the selected track with reverb',
    snapshot: mockSnapshot,
    references: []
  });

  assert.ok(response.plan);
  assert.equal(response.plan?.title, 'Write onto Pad');
  assert.equal(response.plan?.commands[0]?.type, 'arm_track');
  assert.ok(response.plan?.commands.some((command) => command.type === 'create_midi_clip'));
  assert.ok(!response.plan?.commands.some((command) => command.type === 'create_midi_track'));
});

test('explicit audio-track request builds a direct audio-track plan', () => {
  const response = createConversationResponse({
    message: 'create a new audio track and call it kick',
    snapshot: mockSnapshot,
    references: []
  });

  assert.ok(response.plan);
  assert.equal(response.plan?.commands.length, 1);
  assert.equal(response.plan?.commands[0]?.type, 'create_audio_track');
  if (response.plan?.commands[0]?.type === 'create_audio_track') {
    assert.match(response.plan.commands[0].trackName, /kick/i);
  }
});

test('help prompt returns concrete capability guidance', () => {
  const response = createConversationResponse({
    message: 'how do you help',
    snapshot: mockSnapshot,
    references: mockReferences
  });

  assert.match(response.reply, /What I can do right now:/);
  assert.match(response.reply, /Write an 8 bar pad idea on the selected track/i);
  assert.equal(response.plan, undefined);
});

test('width request builds an effect plan for the selected track', () => {
  const response = createConversationResponse({
    message: 'make the selected track wider',
    snapshot: mockSnapshot,
    references: []
  });

  assert.ok(response.plan);
  assert.equal(response.plan?.title, 'Add chain to Pad');
  assert.ok(response.plan?.commands.some((command) => command.type === 'insert_native_device'));
  assert.ok(response.plan?.commands.some((command) => command.type === 'set_device_parameter'));
});

test('mastering question returns production-oriented mastering advice', () => {
  const response = createConversationResponse({
    message: 'how should I approach mastering this',
    snapshot: mockSnapshot,
    references: mockReferences
  });

  assert.match(response.reply, /crest factor/i);
  assert.match(response.reply, /pre-master/i);
  assert.equal(response.plan, undefined);
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

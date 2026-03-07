import test from 'node:test';
import assert from 'node:assert/strict';
import { mockReferences, mockSnapshot } from '@shared/index';
import type { AiSettings } from '@shared/types';
import { createModelBackedConversationResponse, testAiConnection } from './model-orchestrator';

const ollamaSettings: AiSettings = {
  provider: 'ollama',
  model: 'llama3.1:8b',
  baseUrl: 'http://127.0.0.1:11434/v1',
  temperature: 0.3
};

test('model-backed response accepts valid JSON plans', async () => {
  const response = await createModelBackedConversationResponse(
    {
      message: 'Add a short bass idea',
      snapshot: mockSnapshot,
      references: mockReferences
    },
    ollamaSettings,
    async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: 'Add a restrained bass line under the current drop entry.',
                  plan: {
                    title: 'Add bass support',
                    summary: 'Create a new bass track with a short MIDI idea.',
                    rationale: 'The current selected track is empty and can support a new layer.',
                    commands: [
                      {
                        type: 'create_midi_track',
                        trackName: 'Bass Support',
                        insertIndex: 3
                      },
                      {
                        type: 'insert_native_device',
                        trackIndex: 3,
                        deviceName: 'Operator',
                        deviceCategory: 'instrument'
                      }
                    ]
                  }
                })
              }
            }
          ]
        }),
        { status: 200 }
      )
  );

  assert.equal(response.source, 'model');
  assert.equal(response.plan?.title, 'Add bass support');
  assert.equal(response.plan?.commands.length, 2);
});

test('model-backed response falls back when model output is invalid', async () => {
  const response = await createModelBackedConversationResponse(
    {
      message: 'Give me arrangement advice',
      snapshot: mockSnapshot,
      references: mockReferences
    },
    ollamaSettings,
    async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'not valid json' } }]
        }),
        { status: 200 }
      )
  );

  assert.equal(response.source, 'heuristic');
  assert.match(response.warning ?? '', /invalid json/i);
});

test('model-backed response falls back when model reply is generic', async () => {
  const response = await createModelBackedConversationResponse(
    {
      message: 'how do you help',
      snapshot: mockSnapshot,
      references: mockReferences,
      chatHistory: [
        {
          id: 'chat-1',
          role: 'user',
          content: 'how do you help',
          createdAt: new Date('2026-03-07T17:53:39.000Z').toISOString()
        }
      ]
    },
    ollamaSettings,
    async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: "I'm ready to help. What would you like to achieve with the Pad track?",
                  plan: null
                })
              }
            }
          ]
        }),
        { status: 200 }
      )
  );

  assert.equal(response.source, 'heuristic');
  assert.match(response.warning ?? '', /too generic/i);
  assert.match(response.reply, /What I can do right now:/);
});

test('model-backed response falls back when action request has no plan', async () => {
  const response = await createModelBackedConversationResponse(
    {
      message: 'create a new midi track',
      snapshot: mockSnapshot,
      references: [],
      chatHistory: []
    },
    ollamaSettings,
    async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: 'Creating a new MIDI track now.',
                  plan: null
                })
              }
            }
          ]
        }),
        { status: 200 }
      )
  );

  assert.equal(response.source, 'heuristic');
  assert.match(response.warning ?? '', /did not return an actionable ableton plan/i);
  assert.ok(response.plan);
});

test('generic-model detection tolerates non-string live track names', async () => {
  const weirdSnapshot = {
    ...mockSnapshot,
    tracks: mockSnapshot.tracks.map((track, index) =>
      index === 2
        ? {
            ...track,
            name: ['1-MIDI'] as unknown as string
          }
        : track
    )
  };

  const response = await createModelBackedConversationResponse(
    {
      message: 'add an 8 bar bass idea with saturation',
      snapshot: weirdSnapshot,
      references: [],
      chatHistory: []
    },
    ollamaSettings,
    async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: 'Creating a new MIDI track now.',
                  plan: null
                })
              }
            }
          ]
        }),
        { status: 200 }
      )
  );

  assert.equal(response.source, 'heuristic');
  assert.match(response.warning ?? '', /actionable ableton plan/i);
});

test('connection test reports success for reachable endpoints', async () => {
  const result = await testAiConnection(
    ollamaSettings,
    async () => new Response(JSON.stringify({ data: [] }), { status: 200 })
  );

  assert.equal(result.ok, true);
  assert.match(result.message, /connected/i);
});

test('connection test gives actionable ollama guidance on network failure', async () => {
  const result = await testAiConnection(
    ollamaSettings,
    async () => {
      throw new Error('fetch failed');
    }
  );

  assert.equal(result.ok, false);
  assert.match(result.message, /could not reach ollama/i);
  assert.match(result.message, /127\.0\.0\.1:11434\/v1/i);
});

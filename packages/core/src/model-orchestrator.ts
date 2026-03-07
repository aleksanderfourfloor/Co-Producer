import { defaultAiSettings } from '@shared/settings';
import type {
  AbletonCommand,
  ActionPlan,
  AiConnectionTestResult,
  AiProvider,
  AiSettings,
  ChatTurn,
  ContextSnapshot,
  ConversationRequest,
  ConversationResponse,
  DeviceType,
  MidiNote,
  ReferenceAnalysis
} from '@shared/types';
import { createConversationResponse as createHeuristicConversationResponse } from './planner';
import { clamp, createId, formatList } from './utils';

interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionsResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

type FetchLike = typeof fetch;

function summarizeSnapshot(snapshot: ContextSnapshot): string {
  const selectedTrack =
    snapshot.tracks.find((track) => track.id === snapshot.selection.trackId) ??
    snapshot.tracks.find((track) => track.index === snapshot.selection.trackIndex);

  const trackSummary = snapshot.tracks
    .map((track) => {
      const clips = `${track.clips.length} clips`;
      const devices = `${track.devices.length} devices`;
      return `${track.index}:${track.name} [${track.type}/${track.role}] ${clips}, ${devices}`;
    })
    .join('\n');

  const locators = snapshot.locators.map((locator) => `${locator.name}@${locator.beat}`).join(', ');

  return [
    `Tempo: ${snapshot.tempo} BPM`,
    `Time signature: ${snapshot.timeSignature[0]}/${snapshot.timeSignature[1]}`,
    `Selection: ${selectedTrack ? selectedTrack.name : 'none'}`,
    `Locators: ${locators || 'none'}`,
    'Tracks:',
    trackSummary || 'No tracks'
  ].join('\n');
}

function summarizeReferences(references: ReferenceAnalysis[]): string {
  if (references.length === 0) {
    return 'No reference files imported.';
  }

  return references
    .slice(0, 3)
    .map((reference) => {
      const notes = reference.features.notes?.slice(0, 2) ?? [];
      return `${reference.fileName}: tempo=${reference.features.tempoEstimate ?? 'unknown'}, rms=${reference.features.rms}, peak=${reference.features.peak}, notes=${formatList(notes) || 'none'}`;
    })
    .join('\n');
}

function buildSystemPrompt(settings: AiSettings): string {
  const base = [
    'You are Co-Producer, a senior music production copilot for Ableton Live.',
    'You help with arrangement, composition, sound design direction, and practical next steps.',
    'Your answer must be useful inside the current session, not a generic capability statement.',
    'Always mention at least one concrete next move tied to the selected track, active section, or imported reference when available.',
    'If the user asks a broad question such as "how do you help", answer with 2 to 4 specific things you can do right now in this exact set and include 1 to 3 example prompts.',
    'When proposing actions, only use the allowed Ableton command schema.',
    'Prefer concise, concrete, musically aware advice that references the actual session context.',
    'Never invent unsupported commands.',
    'If you do not need an action plan, set "plan" to null.',
    'Return JSON only. Do not wrap it in markdown fences.',
    'JSON shape: {"reply":"string","plan":null|{"title":"string","summary":"string","rationale":"string","commands":[...]}}',
    'Allowed command types and required fields:',
    '- create_midi_track: {type, trackName, insertIndex?}',
    '- create_audio_track: {type, trackName, insertIndex?}',
    '- create_midi_clip: {type, trackIndex?, trackId?, clipName, slotIndex, startBeat, lengthBeats}',
    '- replace_clip_notes: {type, trackIndex?, trackId?, clipId?, slotIndex?, notes:[{pitch,startBeat,durationBeats,velocity,muted?,probability?}]}',
    '- insert_native_device: {type, trackIndex?, trackId?, deviceName, deviceCategory, insertIndex?}',
    '- set_device_parameter: {type, trackId?, deviceId?, parameterId?, parameterName, value}',
    '- name_track: {type, trackIndex?, trackId?, name}',
    '- set_track_color: {type, trackIndex?, trackId?, color}',
    '- arm_track: {type, trackIndex?, trackId?, armed}'
  ].join('\n');

  if (!settings.systemPrompt?.trim()) {
    return base;
  }

  return `${base}\nAdditional instructions:\n${settings.systemPrompt.trim()}`;
}

function summarizeChatHistory(chatHistory: ChatTurn[] = []): string {
  if (chatHistory.length === 0) {
    return 'No prior conversation.';
  }

  return chatHistory
    .slice(-6)
    .map((turn) => `${turn.role === 'assistant' ? 'Assistant' : 'User'}: ${turn.content}`)
    .join('\n');
}

function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return trimmed.slice(start, end + 1);
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function parseNote(value: unknown): MidiNote | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const note = value as Record<string, unknown>;
  const pitch = asNumber(note.pitch);
  const startBeat = asNumber(note.startBeat);
  const durationBeats = asNumber(note.durationBeats);
  const velocity = asNumber(note.velocity);

  if (
    pitch === undefined ||
    startBeat === undefined ||
    durationBeats === undefined ||
    velocity === undefined
  ) {
    return null;
  }

  return {
    pitch,
    startBeat,
    durationBeats,
    velocity,
    muted: asBoolean(note.muted),
    probability: asNumber(note.probability)
  };
}

function parseCommand(value: unknown): AbletonCommand | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const type = asString(record.type);
  if (!type) {
    return null;
  }

  switch (type) {
    case 'create_midi_track':
    case 'create_audio_track': {
      const trackName = asString(record.trackName);
      if (!trackName) {
        return null;
      }
      return {
        type,
        trackName,
        insertIndex: asNumber(record.insertIndex)
      };
    }
    case 'create_midi_clip': {
      const clipName = asString(record.clipName);
      const slotIndex = asNumber(record.slotIndex);
      const startBeat = asNumber(record.startBeat);
      const lengthBeats = asNumber(record.lengthBeats);
      if (!clipName || slotIndex === undefined || startBeat === undefined || lengthBeats === undefined) {
        return null;
      }
      return {
        type,
        trackId: asString(record.trackId),
        trackIndex: asNumber(record.trackIndex),
        clipName,
        slotIndex,
        startBeat,
        lengthBeats
      };
    }
    case 'replace_clip_notes': {
      const rawNotes = Array.isArray(record.notes) ? record.notes : [];
      const notes = rawNotes.map(parseNote).filter((note): note is MidiNote => note !== null);
      if (notes.length === 0) {
        return null;
      }
      return {
        type,
        clipId: asString(record.clipId),
        trackId: asString(record.trackId),
        trackIndex: asNumber(record.trackIndex),
        slotIndex: asNumber(record.slotIndex),
        notes
      };
    }
    case 'insert_native_device': {
      const deviceName = asString(record.deviceName);
      const deviceCategory = asString(record.deviceCategory);
      const allowedCategories: DeviceType[] = ['instrument', 'audio_effect', 'midi_effect', 'unknown'];
      if (
        !deviceName ||
        !deviceCategory ||
        !allowedCategories.includes(deviceCategory as DeviceType)
      ) {
        return null;
      }
      return {
        type,
        trackId: asString(record.trackId),
        trackIndex: asNumber(record.trackIndex),
        deviceName,
        deviceCategory: deviceCategory as DeviceType,
        insertIndex: asNumber(record.insertIndex)
      };
    }
    case 'set_device_parameter': {
      const parameterName = asString(record.parameterName);
      const valueNumber = asNumber(record.value);
      if (!parameterName || valueNumber === undefined) {
        return null;
      }
      return {
        type,
        trackId: asString(record.trackId),
        deviceId: asString(record.deviceId),
        parameterId: asString(record.parameterId),
        parameterName,
        value: clamp(valueNumber, 0, 1)
      };
    }
    case 'name_track': {
      const name = asString(record.name);
      if (!name) {
        return null;
      }
      return {
        type,
        trackId: asString(record.trackId),
        trackIndex: asNumber(record.trackIndex),
        name
      };
    }
    case 'set_track_color': {
      const color = asString(record.color);
      if (!color) {
        return null;
      }
      return {
        type,
        trackId: asString(record.trackId),
        trackIndex: asNumber(record.trackIndex),
        color
      };
    }
    case 'arm_track': {
      const armed = asBoolean(record.armed);
      if (armed === undefined) {
        return null;
      }
      return {
        type,
        trackId: asString(record.trackId),
        trackIndex: asNumber(record.trackIndex),
        armed
      };
    }
    default:
      return null;
  }
}

function normalizeModelResponse(
  raw: string,
  snapshotRevision: string
): ConversationResponse | null {
  const json = extractJsonObject(raw);
  if (!json) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const reply = asString(record.reply);
  if (!reply) {
    return null;
  }

  const rawPlan = record.plan;
  if (!rawPlan) {
    return {
      reply,
      source: 'model'
    };
  }

  if (typeof rawPlan !== 'object') {
    return null;
  }

  const planRecord = rawPlan as Record<string, unknown>;
  const title = asString(planRecord.title);
  const summary = asString(planRecord.summary);
  const rationale = asString(planRecord.rationale);
  const rawCommands = Array.isArray(planRecord.commands) ? planRecord.commands : [];
  const commands = rawCommands
    .map(parseCommand)
    .filter((command): command is AbletonCommand => command !== null);

  if (!title || !summary || !rationale || commands.length === 0) {
    return {
      reply,
      source: 'model',
      warning: 'The model response did not contain a valid action plan, so only the text reply was used.'
    };
  }

  return {
    reply,
    source: 'model',
    plan: {
      id: createId('plan'),
      title,
      summary,
      rationale,
      createdAt: new Date().toISOString(),
      snapshotRevision,
      commands
    }
  };
}

async function callChatCompletions(
  settings: AiSettings,
  messages: ChatCompletionMessage[],
  fetcher: FetchLike
): Promise<string> {
  const response = await fetcher(`${settings.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {})
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: clamp(settings.temperature, 0, 1),
      response_format: { type: 'json_object' },
      messages
    }),
    signal: AbortSignal.timeout(25000)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Model request failed (${response.status}): ${body.slice(0, 220)}`);
  }

  const payload = (await response.json()) as ChatCompletionsResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Model response did not include message content.');
  }

  return content;
}

function buildMessages(request: ConversationRequest, settings: AiSettings): ChatCompletionMessage[] {
  const userPrompt = [
    `User request: ${request.message}`,
    '',
    'Recent conversation:',
    summarizeChatHistory(request.chatHistory),
    '',
    'Ableton session context:',
    summarizeSnapshot(request.snapshot),
    '',
    'Reference context:',
    summarizeReferences(request.references),
    '',
    'Return only JSON in the required schema.'
  ].join('\n');

  return [
    {
      role: 'system',
      content: buildSystemPrompt(settings)
    },
    {
      role: 'user',
      content: userPrompt
    }
  ];
}

function normalizeTrackName(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry : String(entry)))
      .join(' ')
      .trim();
  }

  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
}

function requestNeedsActionPlan(message: string): boolean {
  return /\b(add|create|make|write|generate|build|insert|put|give me|do it)\b/i.test(message);
}

function isGenericModelReply(reply: string, request: ConversationRequest): boolean {
  const normalized = reply.trim().toLowerCase();
  const selectedTrack =
    request.snapshot.tracks.find((track) => track.id === request.snapshot.selection.trackId) ??
    request.snapshot.tracks.find((track) => track.index === request.snapshot.selection.trackIndex);
  const selectedTrackName = normalizeTrackName(selectedTrack?.name).toLowerCase();

  const genericPatterns = [
    /^i can assist with/,
    /^i'?m ready to help/,
    /^what would you like to achieve/,
    /^how can i help/,
    /^i can help with/
  ];

  if (genericPatterns.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  const mentionsConcreteContext =
    normalized.includes(String(request.snapshot.tempo).toLowerCase()) ||
    normalized.includes('drop') ||
    normalized.includes('break') ||
    normalized.includes('arrangement') ||
    normalized.includes('operator') ||
    normalized.includes('wavetable') ||
    (selectedTrackName.length > 0 && normalized.includes(selectedTrackName));

  if (normalized.length < 140 && !mentionsConcreteContext) {
    return true;
  }

  return false;
}

function describeConnectionFailure(error: unknown, settings: AiSettings): string {
  const rawMessage = error instanceof Error ? error.message : 'Failed to reach the model endpoint.';

  if (settings.provider === 'ollama') {
    return `Could not reach Ollama at ${settings.baseUrl}. Make sure Ollama is installed, running, and serving a model such as ${settings.model}. Original error: ${rawMessage}`;
  }

  if (settings.provider === 'openai_compatible') {
    return `Could not reach the model endpoint at ${settings.baseUrl}. Check the base URL, API key, and whether the server is running. Original error: ${rawMessage}`;
  }

  return rawMessage;
}

export async function createModelBackedConversationResponse(
  request: ConversationRequest,
  settings: AiSettings,
  fetcher: FetchLike = fetch
): Promise<ConversationResponse> {
  if (settings.provider === 'heuristic') {
    const fallback = createHeuristicConversationResponse(request);
    return {
      ...fallback,
      source: 'heuristic'
    };
  }

  const normalizedSettings = {
    ...defaultAiSettings,
    ...settings
  };

  try {
    const content = await callChatCompletions(
      normalizedSettings,
      buildMessages(request, normalizedSettings),
      fetcher
    );
    const normalized = normalizeModelResponse(content, request.snapshot.setRevision);
    if (
      normalized &&
      !isGenericModelReply(normalized.reply, request) &&
      (!requestNeedsActionPlan(request.message) || Boolean(normalized.plan))
    ) {
      return normalized;
    }
    const fallback = createHeuristicConversationResponse(request);
    return {
      ...fallback,
      source: 'heuristic',
      warning: normalized
        ? requestNeedsActionPlan(request.message) && !normalized.plan
          ? 'The model did not return an actionable Ableton plan, so the heuristic copilot handled this turn.'
          : 'The model response was too generic for the current set, so the heuristic copilot handled this turn.'
        : 'The model returned invalid JSON, so the heuristic copilot handled this turn.'
    };
  } catch (error) {
    const fallback = createHeuristicConversationResponse(request);
    return {
      ...fallback,
      source: 'heuristic',
      warning: describeConnectionFailure(error, normalizedSettings)
    };
  }
}

export async function testAiConnection(
  settings: AiSettings,
  fetcher: FetchLike = fetch
): Promise<AiConnectionTestResult> {
  if (settings.provider === 'heuristic') {
    return {
      ok: true,
      message: 'Heuristic mode is active. No external model connection is required.',
      provider: settings.provider
    };
  }

  try {
    const response = await fetcher(`${settings.baseUrl.replace(/\/$/, '')}/models`, {
      headers: {
        ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {})
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        ok: false,
        message: `Model endpoint check failed (${response.status}): ${body.slice(0, 180)}`,
        provider: settings.provider
      };
    }

    return {
      ok: true,
      message: `Connected to ${settings.provider} endpoint at ${settings.baseUrl}.`,
      provider: settings.provider
    };
  } catch (error) {
    return {
      ok: false,
      message: describeConnectionFailure(error, settings),
      provider: settings.provider
    };
  }
}

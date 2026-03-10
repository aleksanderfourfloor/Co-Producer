import type {
  AbletonCommand,
  ActionPlan,
  AudioFeatureSummary,
  ContextSnapshot,
  ConversationRequest,
  ConversationResponse,
  DeviceType,
  MusicalRole,
  ReferenceAnalysis,
  TrackSummary
} from '@shared/types';
import { createId, formatList } from './utils';
import { generateNotesForRole, inferBarLength, inferRole } from './music';

const ROLE_TRACK_NAME: Record<MusicalRole, string> = {
  drums: 'Drums',
  bass: 'Bass',
  lead: 'Lead',
  pad: 'Pad',
  fx: 'FX',
  vocal: 'Vocal',
  utility: 'Utility',
  unknown: 'Idea'
};

const ROLE_COLORS: Record<MusicalRole, string> = {
  drums: '#ff8855',
  bass: '#f4d35e',
  lead: '#a8dadc',
  pad: '#5bc0be',
  fx: '#7f95d1',
  vocal: '#d68fd6',
  utility: '#c4c4c4',
  unknown: '#90be6d'
};

const ROLE_PRIMARY_DEVICE: Record<MusicalRole, { name: string; category: DeviceType }> = {
  drums: { name: 'Drum Rack', category: 'instrument' },
  bass: { name: 'Operator', category: 'instrument' },
  lead: { name: 'Wavetable', category: 'instrument' },
  pad: { name: 'Wavetable', category: 'instrument' },
  fx: { name: 'Operator', category: 'instrument' },
  vocal: { name: 'Simpler', category: 'instrument' },
  utility: { name: 'Utility', category: 'audio_effect' },
  unknown: { name: 'Operator', category: 'instrument' }
};

const DEFAULT_EFFECT_PARAMETERS: Record<string, Array<{ parameterName: string; value: number }>> = {
  'Hybrid Reverb': [{ parameterName: 'Dry/Wet', value: 0.22 }],
  Echo: [{ parameterName: 'Dry/Wet', value: 0.18 }],
  Saturator: [{ parameterName: 'Drive', value: 0.36 }],
  'Glue Compressor': [{ parameterName: 'Dry/Wet', value: 0.55 }],
  'Auto Filter': [{ parameterName: 'Frequency', value: 0.62 }],
  Utility: [{ parameterName: 'Width', value: 1 }],
  Compressor: [{ parameterName: 'Threshold', value: 0.42 }],
  'Chorus-Ensemble': [{ parameterName: 'Dry/Wet', value: 0.28 }]
};

interface DeviceSpec {
  name: string;
  category: DeviceType;
}

interface PromptIntent {
  message: string;
  role: MusicalRole;
  bars: number;
  wantsCreation: boolean;
  wantsEffectChain: boolean;
  wantsArrangementAdvice: boolean;
  wantsMixAdvice: boolean;
  wantsReferenceAdvice: boolean;
  wantsTransition: boolean;
  wantsDirectAction: boolean;
  targetSelectedTrack: boolean;
  primaryDevice: DeviceSpec;
  effectChain: DeviceSpec[];
}

function selectedTrack(snapshot: ContextSnapshot): TrackSummary | undefined {
  if (snapshot.selection.trackId) {
    return snapshot.tracks.find((track) => track.id === snapshot.selection.trackId);
  }

  if (typeof snapshot.selection.trackIndex === 'number') {
    return snapshot.tracks.find((track) => track.index === snapshot.selection.trackIndex);
  }

  return undefined;
}

function nextClipSlot(track?: TrackSummary): number {
  if (!track || track.clips.length === 0) {
    return 0;
  }

  return Math.max(...track.clips.map((clip) => clip.slotIndex)) + 1;
}

function defaultInsertIndex(snapshot: ContextSnapshot): number {
  return -1;
}

function deviceRequested(message: string, pattern: RegExp): boolean {
  return pattern.test(message);
}

function detectPrimaryDevice(message: string, role: MusicalRole): DeviceSpec {
  const lower = message.toLowerCase();

  if (/\boperator\b/.test(lower)) {
    return { name: 'Operator', category: 'instrument' };
  }

  if (/\bwavetable\b/.test(lower)) {
    return { name: 'Wavetable', category: 'instrument' };
  }

  if (/\banalog\b/.test(lower)) {
    return { name: 'Analog', category: 'instrument' };
  }

  if (/\bsimpler\b/.test(lower)) {
    return { name: 'Simpler', category: 'instrument' };
  }

  if (/\bdrum rack\b/.test(lower)) {
    return { name: 'Drum Rack', category: 'instrument' };
  }

  return ROLE_PRIMARY_DEVICE[role];
}

function buildEffectChain(message: string, role: MusicalRole): DeviceSpec[] {
  const effects: DeviceSpec[] = [];

  if (deviceRequested(message, /\b(reverb|space|wash|ambience|atmosphere)\b/i) || role === 'pad') {
    effects.push({ name: 'Hybrid Reverb', category: 'audio_effect' });
  }

  if (deviceRequested(message, /\b(delay|echo|dub)\b/i) || /\barp|lead\b/i.test(message)) {
    effects.push({ name: 'Echo', category: 'audio_effect' });
  }

  if (deviceRequested(message, /\b(saturation|saturator|grit|dirt|warmth|drive)\b/i) || role === 'bass') {
    effects.push({ name: 'Saturator', category: 'audio_effect' });
  }

  if (deviceRequested(message, /\b(glue|compress|tighten|control)\b/i)) {
    effects.push({ name: 'Glue Compressor', category: 'audio_effect' });
  }

  if (deviceRequested(message, /\b(sidechain|pump|duck)\b/i)) {
    effects.push({ name: 'Compressor', category: 'audio_effect' });
  }

  if (deviceRequested(message, /\b(filter|sweep|transition|riser|uplifter)\b/i) || role === 'fx') {
    effects.push({ name: 'Auto Filter', category: 'audio_effect' });
  }

  if (deviceRequested(message, /\b(wide|wider|width|stereo|spread)\b/i)) {
    effects.push({ name: 'Utility', category: 'audio_effect' });
    effects.push({ name: 'Chorus-Ensemble', category: 'audio_effect' });
  }

  return effects.filter(
    (effect, index, array) => array.findIndex((entry) => entry.name === effect.name) === index
  );
}

function targetSelectedTrackFromPrompt(
  snapshot: ContextSnapshot,
  requestedRole: MusicalRole,
  message: string
): boolean {
  const selected = selectedTrack(snapshot);
  if (!selected) {
    return false;
  }

  if (/\b(selected|current|this track|on pad|on bass|on kick)\b/i.test(message)) {
    return true;
  }

  if (selected.clips.length === 0 && (requestedRole === 'unknown' || requestedRole === selected.role)) {
    return true;
  }

  return requestedRole !== 'unknown' && requestedRole === selected.role;
}

function parsePromptIntent(message: string, snapshot: ContextSnapshot): PromptIntent {
  const inferredRole = /\b(transition|riser|uplifter|sweep|impact)\b/i.test(message)
    ? 'fx'
    : inferRole(message);
  const selected = selectedTrack(snapshot);
  const resolvedRole =
    inferredRole === 'unknown' && selected ? selected.role : inferredRole;

  return {
    message,
    role: resolvedRole,
    bars: inferBarLength(message),
    wantsCreation: /\b(add|create|make|new|write|generate|build|do it|give me)\b/i.test(message),
    wantsEffectChain: /\b(reverb|delay|echo|glue|compress|tighten|chain|effect|saturator|saturation|filter|wide|wider|width|stereo|spread|sidechain|pump|duck)\b/i.test(
      message
    ),
    wantsArrangementAdvice: /\b(arrangement|structure|section|drop|break|intro|outro)\b/i.test(message),
    wantsMixAdvice: /\b(mix|balance|mud|muddy|master|loud|glue|compress)\b/i.test(message),
    wantsReferenceAdvice: /\b(reference|compare)\b/i.test(message),
    wantsTransition: /\b(transition|riser|uplifter|sweep|impact)\b/i.test(message),
    wantsDirectAction: /\b(do it|make it|build it|apply|create it|go ahead)\b/i.test(message),
    targetSelectedTrack: targetSelectedTrackFromPrompt(snapshot, resolvedRole, message),
    primaryDevice: detectPrimaryDevice(message, resolvedRole),
    effectChain: buildEffectChain(message, resolvedRole)
  };
}

function addEffectDevices(commands: AbletonCommand[], trackRef: { trackId?: string; trackIndex?: number }, effects: DeviceSpec[]): void {
  for (const effect of effects) {
    commands.push({
      type: 'insert_native_device',
      trackId: trackRef.trackId,
      trackIndex: trackRef.trackIndex,
      deviceName: effect.name,
      deviceCategory: effect.category
    });

    for (const parameter of DEFAULT_EFFECT_PARAMETERS[effect.name] ?? []) {
      commands.push({
        type: 'set_device_parameter',
        trackId: trackRef.trackId,
        parameterName: parameter.parameterName,
        value: parameter.value
      });
    }
  }
}

function describeChain(primaryDevice: DeviceSpec, effectChain: DeviceSpec[]): string {
  const devices = [primaryDevice.name, ...effectChain.map((effect) => effect.name)];
  return formatList(devices);
}

function buildNewTrackPlan(intent: PromptIntent, snapshot: ContextSnapshot): ActionPlan {
  const selected = selectedTrack(snapshot);
  const role = intent.role;
  const trackName = intent.wantsTransition ? 'Transition FX' : ROLE_TRACK_NAME[role];
  const clipLengthBeats = intent.bars * snapshot.timeSignature[0];
  const notes = generateNotesForRole(role, intent.message, clipLengthBeats);
  const insertIndex = defaultInsertIndex(snapshot);
  const commands: AbletonCommand[] = [
    {
      type: 'create_midi_track',
      trackName,
      insertIndex
    },
    {
      type: 'name_track',
      trackIndex: insertIndex,
      name: trackName
    },
    {
      type: 'set_track_color',
      trackIndex: insertIndex,
      color: ROLE_COLORS[role]
    },
    {
      type: 'arm_track',
      trackIndex: insertIndex,
      armed: true
    },
    {
      type: 'insert_native_device',
      trackIndex: insertIndex,
      deviceName: intent.primaryDevice.name,
      deviceCategory: intent.primaryDevice.category
    },
    {
      type: 'create_midi_clip',
      trackIndex: insertIndex,
      clipName: `${trackName} Idea`,
      slotIndex: 0,
      startBeat: 0,
      lengthBeats: clipLengthBeats
    },
    {
      type: 'replace_clip_notes',
      trackIndex: insertIndex,
      slotIndex: 0,
      notes
    }
  ];

  addEffectDevices(commands, { trackIndex: insertIndex }, intent.effectChain);

  return {
    id: createId('plan'),
    title: `Build ${trackName.toLowerCase()} part`,
    summary: `Create a ${intent.bars}-bar ${trackName.toLowerCase()} idea using ${describeChain(intent.primaryDevice, intent.effectChain)}.`,
    rationale: selected
      ? `${selected.name} is selected. New tracks are appended at the end of the set for more reliable Live bridge execution, then can be moved manually if needed.`
      : 'No track is selected, so the new part is added at the end of the set for quick testing.',
    createdAt: new Date().toISOString(),
    snapshotRevision: snapshot.setRevision,
    commands
  };
}

function buildSelectedTrackPlan(intent: PromptIntent, snapshot: ContextSnapshot, track: TrackSummary): ActionPlan {
  const role = intent.role === 'unknown' ? track.role : intent.role;
  const clipLengthBeats = intent.bars * snapshot.timeSignature[0];
  const slotIndex = nextClipSlot(track);
  const notes = generateNotesForRole(role, intent.message, clipLengthBeats);
  const commands: AbletonCommand[] = [];

  if (!track.devices.some((device) => device.name === intent.primaryDevice.name)) {
    commands.push({
      type: 'insert_native_device',
      trackId: track.id,
      trackIndex: track.index,
      deviceName: intent.primaryDevice.name,
      deviceCategory: intent.primaryDevice.category
    });
  }

  commands.push(
    {
      type: 'arm_track',
      trackId: track.id,
      trackIndex: track.index,
      armed: true
    },
    {
      type: 'create_midi_clip',
      trackId: track.id,
      trackIndex: track.index,
      clipName: `${track.name} Idea`,
      slotIndex,
      startBeat: 0,
      lengthBeats: clipLengthBeats
    },
    {
      type: 'replace_clip_notes',
      trackId: track.id,
      trackIndex: track.index,
      slotIndex,
      notes
    }
  );

  addEffectDevices(commands, { trackId: track.id, trackIndex: track.index }, intent.effectChain);

  return {
    id: createId('plan'),
    title: `Write onto ${track.name}`,
    summary: `Write a ${intent.bars}-bar idea directly on ${track.name} using ${describeChain(intent.primaryDevice, intent.effectChain)}.`,
    rationale: `${track.name} is already selected${track.clips.length === 0 ? ' and still empty' : ''}, so writing there is the fastest way to test a new idea without adding more tracks.`,
    createdAt: new Date().toISOString(),
    snapshotRevision: snapshot.setRevision,
    commands
  };
}

function buildEffectPlan(message: string, snapshot: ContextSnapshot, track: TrackSummary): ActionPlan | undefined {
  const role = track.role;
  const effects = buildEffectChain(message, role);
  if (effects.length === 0) {
    return undefined;
  }

  const commands: AbletonCommand[] = [];
  addEffectDevices(commands, { trackId: track.id, trackIndex: track.index }, effects);

  return {
    id: createId('plan'),
    title: `Add chain to ${track.name}`,
    summary: `Insert ${formatList(effects.map((effect) => effect.name))} on ${track.name}.`,
    rationale: `${track.name} is selected, so the chain can be auditioned immediately without touching the arrangement.`,
    createdAt: new Date().toISOString(),
    snapshotRevision: snapshot.setRevision,
    commands
  };
}

function compareEnergy(master?: AudioFeatureSummary, reference?: ReferenceAnalysis): string | undefined {
  if (!master || !reference) {
    return undefined;
  }

  const masterPeakEnergy = Math.max(...master.energyBySegment);
  const referencePeakEnergy = Math.max(...reference.features.energyBySegment);
  const ratio = referencePeakEnergy === 0 ? 1 : masterPeakEnergy / referencePeakEnergy;

  if (ratio < 0.85) {
    return `Compared with ${reference.fileName}, the set is not lifting hard enough into its peak. Add a pre-drop transition or one more harmonic support layer before the drop.`;
  }

  if (ratio > 1.15) {
    return `Compared with ${reference.fileName}, the set peaks early. A cleaner reset before the next lift will create better contrast.`;
  }

  return `Compared with ${reference.fileName}, the energy contour is close. Focus on contrast and tone rather than adding more density.`;
}

function arrangementAdvice(snapshot: ContextSnapshot, references: ReferenceAnalysis[]): string {
  const selected = selectedTrack(snapshot);
  const activeSection =
    [...snapshot.locators].sort((left, right) => left.beat - right.beat).filter(
      (locator) => locator.beat <= snapshot.transport.arrangementPositionBeats
    ).at(-1)?.name ?? 'current section';
  const masterInsight = compareEnergy(snapshot.analysis?.master, references[0]);

  const segments: string[] = [
    `You are at ${snapshot.tempo} BPM in ${activeSection}, with ${formatList(snapshot.tracks.map((track) => track.name))} already in the set.`
  ];

  if (selected) {
    segments.push(
      selected.clips.length === 0
        ? `${selected.name} is selected and empty, so it is the fastest place to add a new idea without creating more clutter.`
        : `${selected.name} is selected, so any next move should either strengthen its role or create contrast around it.`
    );
  }

  if (masterInsight) {
    segments.push(masterInsight);
  } else if (snapshot.analysis?.master?.notes?.[0]) {
    segments.push(snapshot.analysis.master.notes[0]);
  }

  return segments.join(' ');
}

function buildPriorityMoves(snapshot: ContextSnapshot, references: ReferenceAnalysis[]): string[] {
  const selected = selectedTrack(snapshot);
  const moves: string[] = [];

  if (selected?.clips.length === 0) {
    moves.push(`Write a ${selected.role === 'pad' ? 'harmonic' : selected.role} idea directly onto ${selected.name}.`);
  }

  const dropLocator = snapshot.locators.find((locator) => /drop/i.test(locator.name));
  if (dropLocator) {
    moves.push(`Create a one-phrase transition into ${dropLocator.name} to increase contrast.`);
  }

  if (references[0]) {
    moves.push(`Compare the current lift against ${references[0].fileName} and add only one missing energy element, not three.`);
  }

  if (moves.length < 3) {
    moves.push('Subtract one busy layer before the biggest section so the next entrance feels larger.');
  }

  return moves.slice(0, 3);
}

function mixAdvice(snapshot: ContextSnapshot): string {
  const selected = selectedTrack(snapshot);
  const busiestTrack = [...snapshot.tracks].sort(
    (left, right) => right.devices.length + right.clips.length - (left.devices.length + left.clips.length)
  )[0];
  const suggestions: string[] = [];

  if (selected) {
    suggestions.push(`${selected.name} is selected, so start by deciding whether it should lead, support, or get out of the way in this section.`);
  }

  if (busiestTrack) {
    suggestions.push(`${busiestTrack.name} currently carries the most information, so check whether it is masking the hook or low end.`);
  }

  suggestions.push('If the drop feels weak, remove one competing midrange layer before boosting anything.');
  suggestions.push('Use level and filtering decisions first, then glue and space effects second.');

  return suggestions.join(' ');
}

function soundDesignAdvice(snapshot: ContextSnapshot, message: string): string {
  const selected = selectedTrack(snapshot);
  const lower = message.toLowerCase();
  const subject = selected?.name ?? 'the selected sound';
  const advice: string[] = [];

  if (/\bwide|width|stereo|spread\b/.test(lower)) {
    advice.push(`To make ${subject} feel wider, keep the low mids centered, then add width above the body with Utility width, Chorus-Ensemble, or a short reverb layer.`);
  }

  if (/\bpunch|impact|hit harder|stronger\b/.test(lower)) {
    advice.push(`To make ${subject} hit harder, shorten the tail, increase contrast before the transient, and remove one competing layer in the same range.`);
  }

  if (/\bbright|presence|present|cut through\b/.test(lower)) {
    advice.push(`To make ${subject} cut through, shape the upper mids, reduce masking around the hook, and add brightness without boosting the harsh band continuously.`);
  }

  if (/\bwarm|thick|fatter|fuller\b/.test(lower)) {
    advice.push(`To make ${subject} feel fuller, combine gentle saturation with a stable fundamental and avoid stacking too many wide chorus effects below the mids.`);
  }

  if (/\bpad\b/.test(lower) || selected?.role === 'pad') {
    advice.push('For pads, a strong chain is: stable chord voicing, slow filter movement, restrained width, then a reverb that opens only above the core tone.');
  }

  if (/\bbass|sub\b/.test(lower) || selected?.role === 'bass') {
    advice.push('For bass, keep the sub mono, separate the harmonic layer from the fundamental, and use saturation for audibility before adding more notes.');
  }

  if (/\blead|hook|melody\b/.test(lower) || selected?.role === 'lead') {
    advice.push('For leads, focus on one memorable contour, one bright focal band, and one short ambience layer instead of stacking multiple delays.');
  }

  if (advice.length === 0) {
    advice.push(`I need a more specific target than "${message}". Ask about width, punch, brightness, warmth, or role-specific sound design on the selected track and I can answer more concretely.`);
  }

  return advice.join(' ');
}

function masteringAdvice(snapshot: ContextSnapshot, references: ReferenceAnalysis[]): string {
  const master = snapshot.analysis?.master;
  const reference = references[0];
  const advice: string[] = [];

  if (master) {
    advice.push(`Your current master snapshot peaks at ${master.peak.toFixed(2)} with RMS around ${master.rms.toFixed(2)} and crest factor ${master.crestFactor.toFixed(2)}.`);
  } else {
    advice.push('No live master analysis is available yet, so treat this as workflow guidance rather than a final master diagnosis.');
  }

  if (reference) {
    advice.push(compareEnergy(master, reference) ?? `Reference ${reference.fileName} is available for comparison.`);
  }

  advice.push('For a better pre-master, solve balance and arrangement density first, then use bus processing for glue, and leave final loudness moves until the end.');
  advice.push('If the drop feels small after limiting, the problem is usually contrast or masking upstream, not the limiter itself.');

  return advice.join(' ');
}

function capabilityHelp(snapshot: ContextSnapshot, references: ReferenceAnalysis[]): string {
  const selected = selectedTrack(snapshot);
  const examples: string[] = [];

  if (selected?.type === 'midi') {
    examples.push(
      `I can write a new ${selected.role === 'unknown' ? 'musical' : selected.role} idea directly onto ${selected.name} and build a native device chain around it.`
    );
  }

  examples.push('I can create a new MIDI track, add a clip, write notes, and insert native Ableton instruments or effects.');

  if (references[0]) {
    examples.push(`I can compare this set against ${references[0].fileName} and suggest arrangement or energy changes before the next drop.`);
  } else {
    examples.push('I can analyze an imported reference track and turn it into arrangement or energy suggestions.');
  }

  const promptSuggestions = [
    selected?.type === 'midi'
      ? `Write an 8 bar ${selected.role === 'unknown' ? 'idea' : selected.role} idea on the selected track with ${selected.role === 'pad' ? 'Wavetable and reverb' : 'Operator and Saturator'}`
      : 'Add an 8 bar bass idea with saturation',
    'Add a transition into the drop',
    'Compare this set to my reference and tell me what is missing before the drop'
  ];

  return [
    arrangementAdvice(snapshot, references),
    '',
    'What I can do right now:',
    ...examples.map((example, index) => `${index + 1}. ${example}`),
    '',
    'Best prompts to try next:',
    ...promptSuggestions.map((prompt, index) => `${index + 1}. ${prompt}`)
  ].join('\n');
}

function standaloneNextStepAdvice(snapshot: ContextSnapshot, references: ReferenceAnalysis[]): string {
  const moves = buildPriorityMoves(snapshot, references)
    .map((move, index) => `${index + 1}. ${move}`)
    .join('\n');

  return `${arrangementAdvice(snapshot, references)}\n\nMost useful next moves:\n${moves}`;
}

function buildSuggestedActionPlan(snapshot: ContextSnapshot, references: ReferenceAnalysis[]): ActionPlan | undefined {
  const selected = selectedTrack(snapshot);
  if (!selected || selected.type !== 'midi' || selected.clips.length > 0) {
    return undefined;
  }

  const syntheticPrompt = `${selected.role} ${references[0] ? 'with reference-aware lift' : ''}`;
  const intent = parsePromptIntent(syntheticPrompt, snapshot);
  return buildSelectedTrackPlan(intent, snapshot, selected);
}

function requestsMusicalMaterial(message: string): boolean {
  return /\b(clip|notes|idea|part|layer|melody|chord|bass|pad|lead|drum|transition|riser|write|generate|create)\b/i.test(
    message
  );
}

function parseExplicitTrackCreation(message: string): { type: 'audio' | 'midi'; name?: string } | undefined {
  const lower = message.toLowerCase();
  if (!/\b(create|add|new|make)\b/.test(lower) || !/\btrack\b/.test(lower)) {
    return undefined;
  }

  const type = /\baudio\b/.test(lower) ? 'audio' : /\bmidi\b/.test(lower) ? 'midi' : undefined;
  if (!type) {
    return undefined;
  }

  const quotedNameMatch = message.match(/(?:call|name|named)\s+(?:it|the track|track)?\s*["']([^"']{1,48})["']/i);
  if (quotedNameMatch?.[1]) {
    return { type, name: quotedNameMatch[1].trim() };
  }

  const looseNameMatch = message.match(/(?:call|name|named)\s+(?:it|the track|track)?\s+([a-z0-9][a-z0-9 _-]{0,47})/i);
  if (looseNameMatch?.[1]) {
    return { type, name: looseNameMatch[1].trim().replace(/[.!?,;:]+$/, '') };
  }

  return { type };
}

function buildExplicitTrackCreationPlan(message: string, snapshot: ContextSnapshot): ActionPlan | undefined {
  const request = parseExplicitTrackCreation(message);
  if (!request) {
    return undefined;
  }

  const selected = selectedTrack(snapshot);
  const trackName = request.name || (request.type === 'audio' ? 'Audio' : 'MIDI');
  const insertIndex = defaultInsertIndex(snapshot);

  return {
    id: createId('plan'),
    title: `Create ${request.type} track`,
    summary: `Create a new ${request.type} track named ${trackName}.`,
    rationale: selected
      ? `${selected.name} is selected. The new track is appended at the end for reliable bridge execution and can be moved manually after creation.`
      : 'No track is selected, so the new track is appended at the end for reliable bridge execution.',
    createdAt: new Date().toISOString(),
    snapshotRevision: snapshot.setRevision,
    commands: [
      {
        type: request.type === 'audio' ? 'create_audio_track' : 'create_midi_track',
        trackName,
        insertIndex
      }
    ]
  };
}

function buildActionPlan(message: string, snapshot: ContextSnapshot, references: ReferenceAnalysis[]): ActionPlan | undefined {
  const explicitTrackCreationPlan = buildExplicitTrackCreationPlan(message, snapshot);
  if (explicitTrackCreationPlan) {
    return explicitTrackCreationPlan;
  }

  const intent = parsePromptIntent(message, snapshot);
  const selected = selectedTrack(snapshot);

  if (intent.wantsEffectChain && !requestsMusicalMaterial(message) && selected) {
    return buildEffectPlan(message, snapshot, selected);
  }

  if (intent.wantsCreation || intent.wantsDirectAction || intent.wantsTransition) {
    if (selected?.type === 'midi' && intent.targetSelectedTrack) {
      return buildSelectedTrackPlan(intent, snapshot, selected);
    }

    return buildNewTrackPlan(intent, snapshot);
  }

  if ((/\b(next|stuck|help|what should i do)\b/i.test(message) || intent.wantsArrangementAdvice) && selected?.type === 'midi' && selected.clips.length === 0) {
    return buildSuggestedActionPlan(snapshot, references);
  }

  return undefined;
}

function planReply(plan: ActionPlan, snapshot: ContextSnapshot): string {
  const selected = selectedTrack(snapshot);
  const commandCount = plan.commands.length;
  const trackFocus = selected ? `Current focus is ${selected.name}.` : 'No track is selected.';

  return `${trackFocus} I prepared a ${commandCount}-step action plan: ${plan.summary} ${plan.rationale}`;
}

export function createConversationResponse(request: ConversationRequest): ConversationResponse {
  const lowered = request.message.toLowerCase();
  const plan = buildActionPlan(request.message, request.snapshot, request.references);

  if (/\b(how do you help|what can you do|how can you help|yes but how|what do you do)\b/.test(lowered)) {
    return { reply: capabilityHelp(request.snapshot, request.references), source: 'heuristic' };
  }

  if (plan) {
    return {
      reply: planReply(plan, request.snapshot),
      plan,
      source: 'heuristic'
    };
  }

  if (/\b(mix|balance|mud|muddy|master|mastering|loud|glue|compress)\b/.test(lowered)) {
    if (/\b(master|mastering|loud)\b/.test(lowered)) {
      return { reply: masteringAdvice(request.snapshot, request.references), source: 'heuristic' };
    }

    return { reply: mixAdvice(request.snapshot), source: 'heuristic' };
  }

  if (/\b(sound design|wide|wider|width|stereo|spread|punch|impact|bright|presence|warm|thick|fatter|fuller)\b/.test(lowered)) {
    return { reply: soundDesignAdvice(request.snapshot, request.message), source: 'heuristic' };
  }

  if (/\b(reference|compare|arrangement|structure|section|drop|break|next|stuck|help)\b/.test(lowered)) {
    return { reply: standaloneNextStepAdvice(request.snapshot, request.references), source: 'heuristic' };
  }

  return {
    reply: `${arrangementAdvice(request.snapshot, request.references)} Ask for a concrete action such as "write a 8-bar pad on the selected track with Wavetable and reverb" and I can produce an applyable plan immediately.`,
    source: 'heuristic'
  };
}

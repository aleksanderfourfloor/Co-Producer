import type {
  AbletonCommand,
  ActionPlan,
  AudioFeatureSummary,
  ContextSnapshot,
  ConversationRequest,
  ConversationResponse,
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

const ROLE_DEVICES: Record<MusicalRole, { name: string; category: 'instrument' | 'audio_effect' | 'midi_effect' }> = {
  drums: { name: 'Drum Rack', category: 'instrument' },
  bass: { name: 'Operator', category: 'instrument' },
  lead: { name: 'Wavetable', category: 'instrument' },
  pad: { name: 'Wavetable', category: 'instrument' },
  fx: { name: 'Hybrid Reverb', category: 'audio_effect' },
  vocal: { name: 'EQ Eight', category: 'audio_effect' },
  utility: { name: 'Utility', category: 'audio_effect' },
  unknown: { name: 'Operator', category: 'instrument' }
};

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
  return typeof snapshot.selection.trackIndex === 'number'
    ? snapshot.selection.trackIndex + 1
    : snapshot.tracks.length;
}

function buildTrackCreationPlan(message: string, snapshot: ContextSnapshot): ActionPlan {
  const role = inferRole(message);
  const trackName = ROLE_TRACK_NAME[role];
  const clipBars = inferBarLength(message);
  const clipLengthBeats = clipBars * snapshot.timeSignature[0];
  const notes = generateNotesForRole(role, message, clipLengthBeats);
  const insertIndex = defaultInsertIndex(snapshot);
  const selected = selectedTrack(snapshot);
  const newTrackIndex = insertIndex;
  const slotIndex = 0;
  const device = ROLE_DEVICES[role];
  const commands: AbletonCommand[] = [
    {
      type: 'create_midi_track',
      trackName,
      insertIndex
    },
    {
      type: 'name_track',
      trackIndex: newTrackIndex,
      name: trackName
    },
    {
      type: 'set_track_color',
      trackIndex: newTrackIndex,
      color: ROLE_COLORS[role]
    },
    {
      type: 'arm_track',
      trackIndex: newTrackIndex,
      armed: true
    },
    {
      type: 'insert_native_device',
      trackIndex: newTrackIndex,
      deviceName: device.name,
      deviceCategory: device.category
    },
    {
      type: 'create_midi_clip',
      trackIndex: newTrackIndex,
      clipName: `${trackName} Idea`,
      slotIndex,
      startBeat: 0,
      lengthBeats: clipLengthBeats
    },
    {
      type: 'replace_clip_notes',
      trackIndex: newTrackIndex,
      slotIndex,
      notes
    }
  ];

  if (/\b(reverb|space|wash|ambience)\b/i.test(message)) {
    commands.push({
      type: 'insert_native_device',
      trackIndex: newTrackIndex,
      deviceName: 'Hybrid Reverb',
      deviceCategory: 'audio_effect'
    });
  }

  if (/\b(delay|echo|dub)\b/i.test(message)) {
    commands.push({
      type: 'insert_native_device',
      trackIndex: newTrackIndex,
      deviceName: 'Echo',
      deviceCategory: 'audio_effect'
    });
  }

  if (/\b(saturation|grit|dirt|warmth)\b/i.test(message)) {
    commands.push({
      type: 'insert_native_device',
      trackIndex: newTrackIndex,
      deviceName: 'Saturator',
      deviceCategory: 'audio_effect'
    });
  }

  return {
    id: createId('plan'),
    title: `Add ${trackName} part`,
    summary: `Create a ${clipBars}-bar ${trackName.toLowerCase()} idea with a native Ableton device chain.`,
    rationale: selected
      ? `${selected.name} is currently selected, so the new part is positioned next to the active area of the set.`
      : 'The new part is inserted at the end of the current set for fast auditioning.',
    createdAt: new Date().toISOString(),
    snapshotRevision: snapshot.setRevision,
    commands
  };
}

function buildEffectPlan(message: string, snapshot: ContextSnapshot, track: TrackSummary): ActionPlan {
  const commands: AbletonCommand[] = [];

  if (/\b(reverb|space|wash|ambience)\b/i.test(message)) {
    commands.push({
      type: 'insert_native_device',
      trackId: track.id,
      trackIndex: track.index,
      deviceName: 'Hybrid Reverb',
      deviceCategory: 'audio_effect'
    });
    commands.push({
      type: 'set_device_parameter',
      trackId: track.id,
      parameterName: 'Dry/Wet',
      value: 0.24
    });
  }

  if (/\b(delay|echo|dub)\b/i.test(message)) {
    commands.push({
      type: 'insert_native_device',
      trackId: track.id,
      trackIndex: track.index,
      deviceName: 'Echo',
      deviceCategory: 'audio_effect'
    });
  }

  if (/\b(glue|compress|tighten)\b/i.test(message)) {
    commands.push({
      type: 'insert_native_device',
      trackId: track.id,
      trackIndex: track.index,
      deviceName: 'Glue Compressor',
      deviceCategory: 'audio_effect'
    });
  }

  return {
    id: createId('plan'),
    title: `Add effect chain to ${track.name}`,
    summary: `Insert a native Ableton effect chain on ${track.name}.`,
    rationale: `${track.name} is selected, so the chain can be auditioned immediately without changing arrangement structure.`,
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
    return `Compared with ${reference.fileName}, the current set peaks more gently, so add a stronger pre-drop lift or layer transition FX before the highest-energy section.`;
  }

  if (ratio > 1.15) {
    return `Compared with ${reference.fileName}, the current set reaches its peak energy sooner, so consider a longer breakdown or a softer pre-drop reset to widen contrast.`;
  }

  return `Compared with ${reference.fileName}, the overall energy contour is close, so focus on section contrast and timbral variation rather than adding more density.`;
}

function arrangementAdvice(snapshot: ContextSnapshot, references: ReferenceAnalysis[]): string {
  const trackNames = snapshot.tracks.map((track) => track.name);
  const locatorNames = snapshot.locators.map((locator) => locator.name);
  const selected = selectedTrack(snapshot);
  const masterInsight = compareEnergy(snapshot.analysis?.master, references[0]);

  const segments: string[] = [
    `The set is currently at ${snapshot.tempo} BPM with ${snapshot.tracks.length} tracks: ${formatList(trackNames)}.`
  ];

  if (locatorNames.length > 0) {
    segments.push(`The current structure reads as ${locatorNames.join(' -> ')}.`);
  }

  if (selected) {
    segments.push(
      selected.clips.length === 0
        ? `${selected.name} is selected and still empty, so it is the cleanest place to introduce harmonic movement or a contrast layer.`
        : `${selected.name} is selected, and it already carries ${selected.clips.length} clip${selected.clips.length === 1 ? '' : 's'}.`
    );
  }

  if (masterInsight) {
    segments.push(masterInsight);
  } else if (snapshot.analysis?.master?.notes?.length) {
    const firstNote = snapshot.analysis.master.notes[0];
    if (firstNote) {
      segments.push(firstNote);
    }
  }

  const dropLocator = snapshot.locators.find((locator) => /drop/i.test(locator.name));
  if (dropLocator) {
    segments.push(
      `A strong next move is to create a 16-beat transition element that starts one phrase before ${dropLocator.name} and opens the spectrum into that section.`
    );
  }

  return segments.join(' ');
}

function shouldBuildTrackPlan(message: string): boolean {
  return /\b(add|create|make|new|write|generate|build)\b/i.test(message);
}

function shouldBuildEffectPlan(message: string): boolean {
  return /\b(reverb|delay|echo|glue|compress|tighten|chain|effect)\b/i.test(message);
}

function buildActionPlan(message: string, snapshot: ContextSnapshot): ActionPlan | undefined {
  const selected = selectedTrack(snapshot);

  if (shouldBuildEffectPlan(message) && selected) {
    return buildEffectPlan(message, snapshot, selected);
  }

  if (shouldBuildTrackPlan(message)) {
    return buildTrackCreationPlan(message, snapshot);
  }

  return undefined;
}

function planPreface(plan: ActionPlan): string {
  return `I prepared a grouped action plan called "${plan.title}" with ${plan.commands.length} steps.`;
}

export function createConversationResponse(request: ConversationRequest): ConversationResponse {
  const plan = buildActionPlan(request.message, request.snapshot);
  const advice = arrangementAdvice(request.snapshot, request.references);
  const lowered = request.message.toLowerCase();

  if (plan) {
    const reply = [
      advice,
      planPreface(plan),
      `${plan.summary} ${plan.rationale}`
    ].join(' ');

    return { reply, plan };
  }

  if (/\b(reference|compare|arrangement|structure|section|drop|break)\b/.test(lowered)) {
    return { reply: advice };
  }

  return {
    reply: `${advice} If you want, ask for a concrete part or effect chain and I will turn it into an action plan for Ableton.`
  };
}

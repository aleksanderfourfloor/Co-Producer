import type {
  AbletonCommand,
  ClipSummary,
  ContextSnapshot,
  DeviceSummary,
  MidiNote,
  MusicalRole,
  TrackSummary,
  TrackType
} from '@shared/types';
import { inferRole } from './music';
import { createId } from './utils';

function reindexTracks(tracks: TrackSummary[]): void {
  tracks.forEach((track, index) => {
    track.index = index;
  });
}

function resolveTrack(snapshot: ContextSnapshot, command: AbletonCommand): TrackSummary | undefined {
  if ('trackId' in command && command.trackId) {
    return snapshot.tracks.find((track) => track.id === command.trackId);
  }

  if ('trackIndex' in command && typeof command.trackIndex === 'number') {
    return snapshot.tracks.find((track) => track.index === command.trackIndex);
  }

  return undefined;
}

function trackTypeForCommand(command: AbletonCommand): TrackType {
  if (command.type === 'create_audio_track') {
    return 'audio';
  }

  return 'midi';
}

function roleFromTrackName(trackName: string): MusicalRole {
  const role = inferRole(trackName);
  return role === 'unknown' ? 'utility' : role;
}

function createTrack(
  command: Extract<AbletonCommand, { type: 'create_midi_track' | 'create_audio_track' }>
): TrackSummary {
  const trackName = command.trackName;

  return {
    id: createId('track'),
    index: 0,
    name: trackName,
    type: trackTypeForCommand(command),
    role: roleFromTrackName(trackName),
    armed: false,
    muted: false,
    solo: false,
    clips: [],
    devices: []
  };
}

function createClip(command: Extract<AbletonCommand, { type: 'create_midi_clip' }>): ClipSummary {
  return {
    id: createId('clip'),
    name: command.clipName,
    slotIndex: command.slotIndex,
    startBeat: command.startBeat,
    endBeat: command.startBeat + command.lengthBeats,
    lengthBeats: command.lengthBeats,
    isMidi: true,
    noteCount: 0,
    notes: []
  };
}

function createDevice(
  command: Extract<AbletonCommand, { type: 'insert_native_device' }>
): DeviceSummary {
  return {
    id: createId('device'),
    name: command.deviceName,
    className: command.deviceName,
    type: command.deviceCategory,
    isNative: true,
    parameters: []
  };
}

function assignClipNotes(clip: ClipSummary, notes: MidiNote[]): void {
  clip.isMidi = true;
  clip.notes = notes;
  clip.noteCount = notes.length;
}

function ensureTrack(snapshot: ContextSnapshot, command: AbletonCommand): TrackSummary | undefined {
  return resolveTrack(snapshot, command);
}

export function applyCommandsToSnapshot(
  snapshot: ContextSnapshot,
  commands: AbletonCommand[]
): ContextSnapshot {
  const next = structuredClone(snapshot);

  for (const command of commands) {
    switch (command.type) {
      case 'create_midi_track':
      case 'create_audio_track': {
        const track = createTrack(command);
        const insertIndex =
          typeof command.insertIndex === 'number' ? command.insertIndex : next.tracks.length;
        next.tracks.splice(insertIndex, 0, track);
        reindexTracks(next.tracks);
        next.selection = { trackId: track.id, trackIndex: track.index };
        break;
      }
      case 'name_track': {
        const track = ensureTrack(next, command);
        if (track) {
          track.name = command.name;
        }
        break;
      }
      case 'set_track_color': {
        const track = ensureTrack(next, command);
        if (track) {
          track.color = command.color;
        }
        break;
      }
      case 'arm_track': {
        const track = ensureTrack(next, command);
        if (track) {
          track.armed = command.armed;
        }
        break;
      }
      case 'insert_native_device': {
        const track = ensureTrack(next, command);
        if (track) {
          const device = createDevice(command);
          const insertIndex =
            typeof command.insertIndex === 'number' ? command.insertIndex : track.devices.length;
          track.devices.splice(insertIndex, 0, device);
          next.selection = {
            ...next.selection,
            trackId: track.id,
            trackIndex: track.index,
            deviceId: device.id
          };
        }
        break;
      }
      case 'set_device_parameter': {
        const track = ensureTrack(next, command);
        const device = track?.devices.find((entry) =>
          command.deviceId ? entry.id === command.deviceId : true
        ) ?? track?.devices.at(-1);
        if (device) {
          const parameter =
            device.parameters.find((entry) =>
              command.parameterId ? entry.id === command.parameterId : entry.name === command.parameterName
            ) ??
            (() => {
              const newParameter: DeviceSummary['parameters'][number] = {
                id: command.parameterId ?? createId('param'),
                name: command.parameterName,
                value: command.value
              };
              device.parameters.push(newParameter);
              return newParameter;
            })();

          parameter.value = command.value;
          parameter.displayValue = `${Math.round(command.value * 100)}%`;
        }
        break;
      }
      case 'create_midi_clip': {
        const track = ensureTrack(next, command);
        if (track) {
          const clip = createClip(command);
          track.clips = track.clips.filter((entry) => entry.slotIndex !== command.slotIndex);
          track.clips.push(clip);
          track.clips.sort((left, right) => left.slotIndex - right.slotIndex);
          next.selection = {
            trackId: track.id,
            trackIndex: track.index,
            clipId: clip.id,
            clipSlotIndex: clip.slotIndex
          };
        }
        break;
      }
      case 'replace_clip_notes': {
        const track = ensureTrack(next, command);
        const clip =
          track?.clips.find((entry) =>
            command.clipId ? entry.id === command.clipId : entry.slotIndex === command.slotIndex
          ) ?? track?.clips.at(-1);

        if (clip) {
          assignClipNotes(clip, command.notes);
          next.selection = {
            trackId: track?.id,
            trackIndex: track?.index,
            clipId: clip.id,
            clipSlotIndex: clip.slotIndex
          };
        }
        break;
      }
    }
  }

  next.id = createId('snapshot');
  next.setRevision = createId('rev');
  next.capturedAt = new Date().toISOString();

  return next;
}

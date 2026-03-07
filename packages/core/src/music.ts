import type { MidiNote, MusicalRole } from '@shared/types';

const NOTE_TO_SEMITONE: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11
};

const MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10];
const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];

export interface KeyContext {
  root: string;
  mode: 'minor' | 'major';
  baseMidi: number;
}

export function parseKeyContext(message: string): KeyContext {
  const normalized = message.replace(/\s+/g, ' ');
  const match = normalized.match(/\b([A-G](?:#|b)?)\s*(major|minor)\b/i);

  if (!match) {
    return { root: 'A', mode: 'minor', baseMidi: 57 };
  }

  const matchedRoot = match[1] ?? 'A';
  const root = matchedRoot.charAt(0).toUpperCase() + matchedRoot.slice(1);
  const mode = (match[2] ?? 'minor').toLowerCase() as 'minor' | 'major';
  const aSemitone = 9;
  const semitone = NOTE_TO_SEMITONE[root] ?? aSemitone;
  const octaveBase = mode === 'minor' ? 57 : 60;

  return {
    root,
    mode,
    baseMidi: octaveBase + (semitone - aSemitone)
  };
}

function scaleIntervals(mode: 'minor' | 'major'): number[] {
  return mode === 'minor' ? MINOR_INTERVALS : MAJOR_INTERVALS;
}

function scaleTone(key: KeyContext, degree: number, octaveOffset = 0): number {
  const intervals = scaleIntervals(key.mode);
  const safeDegree = ((degree % intervals.length) + intervals.length) % intervals.length;
  return key.baseMidi + (intervals[safeDegree] ?? 0) + octaveOffset * 12;
}

export function inferRole(message: string): MusicalRole {
  const lower = message.toLowerCase();

  if (/\b(kick|drum|hat|clap|snare|percussion)\b/.test(lower)) {
    return 'drums';
  }

  if (/\b(sub|bass)\b/.test(lower)) {
    return 'bass';
  }

  if (/\b(pad|chord|texture|atmosphere)\b/.test(lower)) {
    return 'pad';
  }

  if (/\b(lead|hook|melody|arp|arpeggio)\b/.test(lower)) {
    return 'lead';
  }

  if (/\b(vocal)\b/.test(lower)) {
    return 'vocal';
  }

  if (/\b(fx|sweep|riser|noise)\b/.test(lower)) {
    return 'fx';
  }

  return 'unknown';
}

export function inferBarLength(message: string): number {
  const match = message.match(/(\d+)\s*bar/i);
  const barText = match?.[1];
  const bars = barText ? Number.parseInt(barText, 10) : 8;
  return Number.isFinite(bars) && bars > 0 ? bars : 8;
}

export function generateNotesForRole(
  role: MusicalRole,
  message: string,
  lengthBeats: number
): MidiNote[] {
  const key = parseKeyContext(message);

  switch (role) {
    case 'drums':
      return generateDrumPattern(lengthBeats);
    case 'bass':
      return generateBassPattern(key, lengthBeats);
    case 'lead':
      return generateLeadPattern(key, lengthBeats);
    case 'pad':
      return generatePadChords(key, lengthBeats);
    default:
      return generatePadChords(key, lengthBeats);
  }
}

function generateBassPattern(key: KeyContext, lengthBeats: number): MidiNote[] {
  const noteCount = Math.max(4, Math.floor(lengthBeats / 2));
  const notes: MidiNote[] = [];

  for (let index = 0; index < noteCount; index += 1) {
    const startBeat = index * 2;
    const degree = index % 4 === 2 ? 4 : 0;
    notes.push({
      pitch: scaleTone(key, degree, -1),
      startBeat,
      durationBeats: 1.5,
      velocity: index % 4 === 0 ? 118 : 108
    });
  }

  return notes;
}

function generatePadChords(key: KeyContext, lengthBeats: number): MidiNote[] {
  const chordCount = Math.max(2, Math.floor(lengthBeats / 8));
  const notes: MidiNote[] = [];

  for (let chordIndex = 0; chordIndex < chordCount; chordIndex += 1) {
    const startBeat = chordIndex * 8;
    const rootDegree = chordIndex % 2 === 0 ? 0 : 5;
    const chord = [
      scaleTone(key, rootDegree, 0),
      scaleTone(key, rootDegree + 2, 0),
      scaleTone(key, rootDegree + 4, 1)
    ];

    chord.forEach((pitch, pitchIndex) => {
      notes.push({
        pitch,
        startBeat,
        durationBeats: 7.5,
        velocity: 78 - pitchIndex * 4
      });
    });
  }

  return notes;
}

function generateLeadPattern(key: KeyContext, lengthBeats: number): MidiNote[] {
  const notes: MidiNote[] = [];
  const stepCount = Math.max(8, Math.floor(lengthBeats * 2));
  const contour = [0, 2, 4, 2, 5, 4, 2, 0];

  for (let step = 0; step < stepCount; step += 1) {
    const startBeat = step * 0.5;
    const degree = contour[step % contour.length] ?? 0;
    notes.push({
      pitch: scaleTone(key, degree, 1),
      startBeat,
      durationBeats: step % 4 === 3 ? 0.75 : 0.45,
      velocity: 92 + (step % 3) * 6
    });
  }

  return notes;
}

function generateDrumPattern(lengthBeats: number): MidiNote[] {
  const notes: MidiNote[] = [];
  const bars = Math.max(1, Math.floor(lengthBeats / 4));

  for (let bar = 0; bar < bars; bar += 1) {
    const base = bar * 4;
    notes.push({ pitch: 36, startBeat: base, durationBeats: 0.25, velocity: 124 });
    notes.push({ pitch: 36, startBeat: base + 2, durationBeats: 0.25, velocity: 120 });
    notes.push({ pitch: 38, startBeat: base + 1, durationBeats: 0.25, velocity: 112 });
    notes.push({ pitch: 38, startBeat: base + 3, durationBeats: 0.25, velocity: 114 });

    for (let step = 0; step < 8; step += 1) {
      notes.push({
        pitch: 42,
        startBeat: base + step * 0.5,
        durationBeats: 0.2,
        velocity: step % 2 === 0 ? 82 : 70
      });
    }
  }

  return notes;
}

import type { ContextSnapshot, ReferenceAnalysis } from './types';

export const mockSnapshot: ContextSnapshot = {
  id: 'snapshot-mock',
  setRevision: 'rev-mock-1',
  capturedAt: new Date('2026-03-07T12:00:00.000Z').toISOString(),
  liveVersion: '12.3.0',
  tempo: 128,
  timeSignature: [4, 4],
  transport: {
    isPlaying: false,
    arrangementPositionBeats: 33,
    loopEnabled: true,
    loopStartBeats: 17,
    loopLengthBeats: 16
  },
  locators: [
    { id: 'locator-1', name: 'Intro', beat: 1 },
    { id: 'locator-2', name: 'Drop', beat: 33 },
    { id: 'locator-3', name: 'Break', beat: 65 }
  ],
  tracks: [
    {
      id: 'track-kick',
      index: 0,
      name: 'Kick',
      type: 'audio',
      role: 'drums',
      armed: false,
      muted: false,
      solo: false,
      color: '#ff8855',
      volumeDb: -4,
      pan: 0,
      clips: [
        {
          id: 'clip-kick-1',
          name: 'Kick Loop',
          slotIndex: 0,
          startBeat: 1,
          endBeat: 17,
          lengthBeats: 16,
          isMidi: false
        }
      ],
      devices: [
        {
          id: 'device-kick-eq',
          name: 'EQ Eight',
          className: 'Eq8',
          type: 'audio_effect',
          isNative: true,
          parameters: [
            {
              id: 'gain-low',
              name: 'Band 1 Gain',
              value: -1.5,
              displayValue: '-1.5 dB',
              unit: 'dB'
            }
          ]
        }
      ]
    },
    {
      id: 'track-bass',
      index: 1,
      name: 'Bass',
      type: 'midi',
      role: 'bass',
      armed: false,
      muted: false,
      solo: false,
      color: '#f4d35e',
      volumeDb: -6,
      pan: 0,
      clips: [
        {
          id: 'clip-bass-1',
          name: 'Bass Motif',
          slotIndex: 0,
          startBeat: 17,
          endBeat: 33,
          lengthBeats: 16,
          isMidi: true,
          noteCount: 12,
          notes: [
            { pitch: 41, startBeat: 0, durationBeats: 1, velocity: 110 },
            { pitch: 41, startBeat: 2, durationBeats: 1, velocity: 110 },
            { pitch: 44, startBeat: 4, durationBeats: 1, velocity: 108 },
            { pitch: 41, startBeat: 6, durationBeats: 1, velocity: 112 }
          ]
        }
      ],
      devices: [
        {
          id: 'device-bass',
          name: 'Operator',
          className: 'Operator',
          type: 'instrument',
          isNative: true,
          parameters: [
            {
              id: 'tone',
              name: 'Tone',
              value: 0.62,
              displayValue: '62%',
              unit: '%'
            }
          ]
        }
      ]
    },
    {
      id: 'track-pad',
      index: 2,
      name: 'Pad',
      type: 'midi',
      role: 'pad',
      armed: true,
      muted: false,
      solo: false,
      color: '#5bc0be',
      volumeDb: -8,
      pan: 0,
      clips: [],
      devices: [
        {
          id: 'device-wavetable',
          name: 'Wavetable',
          className: 'InstrumentVector',
          type: 'instrument',
          isNative: true,
          parameters: [
            {
              id: 'filter',
              name: 'Filter Freq',
              value: 0.48,
              displayValue: '48%',
              unit: '%'
            }
          ]
        }
      ]
    }
  ],
  selection: {
    trackId: 'track-pad',
    trackIndex: 2
  },
  analysis: {
    master: {
      sourceLabel: 'Master',
      durationSeconds: 92,
      peak: 0.93,
      rms: 0.23,
      crestFactor: 4.04,
      spectralCentroid: 2140,
      zeroCrossingRate: 0.11,
      energyBySegment: [0.22, 0.28, 0.31, 0.55, 0.43, 0.62, 0.39, 0.18],
      tempoEstimate: 128,
      notes: ['Drop is the densest section', 'Breakdown energy dip is pronounced']
    }
  }
};

export const mockReferences: ReferenceAnalysis[] = [
  {
    id: 'ref-1',
    fileName: 'warehouse-reference.wav',
    importedAt: new Date('2026-03-07T12:15:00.000Z').toISOString(),
    features: {
      sourceLabel: 'warehouse-reference.wav',
      durationSeconds: 214,
      peak: 0.97,
      rms: 0.26,
      crestFactor: 3.73,
      spectralCentroid: 2430,
      zeroCrossingRate: 0.13,
      energyBySegment: [0.12, 0.2, 0.33, 0.61, 0.58, 0.75, 0.67, 0.28],
      tempoEstimate: 128,
      notes: ['Reference brings in harmonic lift before the first drop']
    }
  }
];

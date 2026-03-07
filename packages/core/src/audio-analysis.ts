import type { AudioFeatureSummary } from '@shared/types';

function rms(samples: Float32Array): number {
  if (samples.length === 0) {
    return 0;
  }

  let total = 0;
  for (const sample of samples) {
    total += sample * sample;
  }

  return Math.sqrt(total / samples.length);
}

function peak(samples: Float32Array): number {
  let max = 0;
  for (const sample of samples) {
    const amplitude = Math.abs(sample);
    if (amplitude > max) {
      max = amplitude;
    }
  }

  return max;
}

function zeroCrossingRate(samples: Float32Array): number {
  if (samples.length < 2) {
    return 0;
  }

  let crossings = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1] ?? 0;
    const current = samples[index] ?? 0;
    if (
      (previous >= 0 && current < 0) ||
      (previous < 0 && current >= 0)
    ) {
      crossings += 1;
    }
  }

  return crossings / (samples.length - 1);
}

function estimateSpectralCentroid(samples: Float32Array, sampleRate: number): number {
  const sampleCount = Math.min(1024, samples.length);

  if (sampleCount < 64) {
    return 0;
  }

  let weightedFrequencies = 0;
  let magnitudeTotal = 0;

  for (let bin = 1; bin < sampleCount / 2; bin += 1) {
    let real = 0;
    let imag = 0;

    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      const sample = samples[sampleIndex] ?? 0;
      const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * sampleIndex) / (sampleCount - 1));
      const angle = (2 * Math.PI * bin * sampleIndex) / sampleCount;
      real += sample * window * Math.cos(angle);
      imag -= sample * window * Math.sin(angle);
    }

    const magnitude = real * real + imag * imag;
    const frequency = (bin * sampleRate) / sampleCount;
    weightedFrequencies += frequency * magnitude;
    magnitudeTotal += magnitude;
  }

  return magnitudeTotal === 0 ? 0 : weightedFrequencies / magnitudeTotal;
}

function energyBySegment(samples: Float32Array, segmentCount = 8): number[] {
  if (samples.length === 0) {
    return [];
  }

  const segmentSize = Math.max(1, Math.floor(samples.length / segmentCount));
  const energies: number[] = [];

  for (let segment = 0; segment < segmentCount; segment += 1) {
    const start = segment * segmentSize;
    const end = segment === segmentCount - 1 ? samples.length : start + segmentSize;
    energies.push(rms(samples.subarray(start, end)));
  }

  return energies;
}

function inferObservations(features: AudioFeatureSummary): string[] {
  const notes: string[] = [];

  if (features.energyBySegment.length > 1) {
    const first = features.energyBySegment[0] ?? 0;
    const last = features.energyBySegment.at(-1) ?? first;
    if (last > first * 1.4) {
      notes.push('Energy ramps significantly toward the final section');
    } else if (last < first * 0.8) {
      notes.push('Energy falls away in the closing section');
    }
  }

  if (features.spectralCentroid > 2800) {
    notes.push('Top-end brightness is pronounced');
  } else if (features.spectralCentroid < 1200) {
    notes.push('The tonal center is weighted toward low-mid energy');
  }

  if (features.crestFactor < 3) {
    notes.push('Dynamics are tightly controlled');
  } else if (features.crestFactor > 5) {
    notes.push('Transient range is wide');
  }

  return notes;
}

export function analyzePcmData(
  samples: Float32Array,
  sampleRate: number,
  sourceLabel: string
): AudioFeatureSummary {
  const samplePeak = peak(samples);
  const sampleRms = rms(samples);
  const crestFactor = sampleRms === 0 ? 0 : samplePeak / sampleRms;

  const features: AudioFeatureSummary = {
    sourceLabel,
    durationSeconds: sampleRate === 0 ? 0 : samples.length / sampleRate,
    peak: Number(samplePeak.toFixed(4)),
    rms: Number(sampleRms.toFixed(4)),
    crestFactor: Number(crestFactor.toFixed(4)),
    spectralCentroid: Number(estimateSpectralCentroid(samples, sampleRate).toFixed(1)),
    zeroCrossingRate: Number(zeroCrossingRate(samples).toFixed(4)),
    energyBySegment: energyBySegment(samples).map((segment) => Number(segment.toFixed(4)))
  };

  features.notes = inferObservations(features);
  return features;
}

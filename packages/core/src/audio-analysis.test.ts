import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePcmData } from './audio-analysis';

test('audio analysis produces stable feature summaries', () => {
  const sampleRate = 44100;
  const length = sampleRate;
  const samples = new Float32Array(length);

  for (let index = 0; index < length; index += 1) {
    samples[index] = Math.sin((2 * Math.PI * 220 * index) / sampleRate) * 0.5;
  }

  const features = analyzePcmData(samples, sampleRate, 'sine.wav');

  assert.equal(features.sourceLabel, 'sine.wav');
  assert.equal(features.durationSeconds, 1);
  assert.ok(features.rms > 0.3 && features.rms < 0.4);
  assert.ok(features.spectralCentroid > 100 && features.spectralCentroid < 600);
  assert.equal(features.energyBySegment.length, 8);
});

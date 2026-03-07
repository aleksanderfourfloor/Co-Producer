import { analyzePcmData, createId } from '@core/index';
import type { ReferenceAnalysis } from '@shared/types';

function mixToMono(buffer: AudioBuffer): Float32Array {
  const mono = new Float32Array(buffer.length);

  for (let channelIndex = 0; channelIndex < buffer.numberOfChannels; channelIndex += 1) {
    const channel = buffer.getChannelData(channelIndex);
    for (let sampleIndex = 0; sampleIndex < buffer.length; sampleIndex += 1) {
      mono[sampleIndex] =
        (mono[sampleIndex] ?? 0) + (channel[sampleIndex] ?? 0) / buffer.numberOfChannels;
    }
  }

  return mono;
}

export async function analyzeReferenceFile(file: File): Promise<ReferenceAnalysis> {
  const audioContext = new AudioContext();
  const arrayBuffer = await file.arrayBuffer();
  const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
  const monoSamples = mixToMono(decoded);
  const features = analyzePcmData(monoSamples, decoded.sampleRate, file.name);
  await audioContext.close();

  return {
    id: createId('reference'),
    fileName: file.name,
    importedAt: new Date().toISOString(),
    features
  };
}

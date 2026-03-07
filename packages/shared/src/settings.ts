import type { AiSettings } from './types';

export const defaultAiSettings: AiSettings = {
  provider: 'heuristic',
  model: 'llama3.1:8b',
  baseUrl: 'http://127.0.0.1:11434/v1',
  temperature: 0.3
};

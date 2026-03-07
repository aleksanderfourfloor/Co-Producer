import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { defaultAiSettings } from '@shared/settings';
import type { AiSettings } from '@shared/types';

export class SettingsStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<AiSettings> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<AiSettings>;
      return {
        ...defaultAiSettings,
        ...parsed
      };
    } catch {
      return defaultAiSettings;
    }
  }

  async save(settings: AiSettings): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(settings, null, 2), 'utf8');
  }
}

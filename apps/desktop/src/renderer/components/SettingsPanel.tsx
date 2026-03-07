import type { AiSettings, CoproducerState } from '@shared/types';

interface SettingsPanelProps {
  state: CoproducerState;
  settingsDraft: AiSettings;
  saving: boolean;
  testing: boolean;
  connectionMessage?: string;
  onDraftChange: (next: AiSettings) => void;
  onSave: () => Promise<void>;
  onTestConnection: () => Promise<void>;
}

export function SettingsPanel({
  state,
  settingsDraft,
  saving,
  testing,
  connectionMessage,
  onDraftChange,
  onSave,
  onTestConnection
}: SettingsPanelProps): JSX.Element {
  const showAdvanced = settingsDraft.provider !== 'heuristic';

  return (
    <section className="panel panel-settings">
      <div className="panel-header">
        <div>
          <p className="eyebrow">AI Setup</p>
          <h2>Make the responses less generic</h2>
        </div>
        <span className="status-pill">
          {state.settings.provider === 'heuristic' ? 'Fallback mode' : state.settings.provider}
        </span>
      </div>

      <div className="settings-grid">
        <label className="field">
          <span>Provider</span>
          <select
            value={settingsDraft.provider}
            onChange={(event) =>
              onDraftChange({
                ...settingsDraft,
                provider: event.target.value as AiSettings['provider']
              })
            }
          >
            <option value="heuristic">Heuristic fallback</option>
            <option value="ollama">Ollama / local</option>
            <option value="openai_compatible">OpenAI-compatible</option>
          </select>
        </label>

        <label className="field">
          <span>Model</span>
          <input
            type="text"
            value={settingsDraft.model}
            onChange={(event) =>
              onDraftChange({
                ...settingsDraft,
                model: event.target.value
              })
            }
            placeholder="llama3.1:8b"
          />
        </label>

        {showAdvanced ? (
          <label className="field field-wide">
            <span>Base URL</span>
            <input
              type="text"
              value={settingsDraft.baseUrl}
              onChange={(event) =>
                onDraftChange({
                  ...settingsDraft,
                  baseUrl: event.target.value
                })
              }
              placeholder="http://127.0.0.1:11434/v1"
            />
          </label>
        ) : null}

        {showAdvanced ? (
          <label className="field field-wide">
            <span>API Key</span>
            <input
              type="password"
              value={settingsDraft.apiKey ?? ''}
              onChange={(event) =>
                onDraftChange({
                  ...settingsDraft,
                  apiKey: event.target.value || undefined
                })
              }
              placeholder="Optional for local models"
            />
          </label>
        ) : null}

        {showAdvanced ? (
          <label className="field">
            <span>Temperature</span>
            <input
              type="number"
              min="0"
              max="1"
              step="0.1"
              value={settingsDraft.temperature}
              onChange={(event) =>
                onDraftChange({
                  ...settingsDraft,
                  temperature: Number.parseFloat(event.target.value || '0.3')
                })
              }
            />
          </label>
        ) : null}

        {showAdvanced ? (
          <label className="field field-wide">
            <span>Extra system prompt</span>
            <textarea
              rows={4}
              value={settingsDraft.systemPrompt ?? ''}
              onChange={(event) =>
                onDraftChange({
                  ...settingsDraft,
                  systemPrompt: event.target.value || undefined
                })
              }
              placeholder="Optional stylistic or workflow instructions"
            />
          </label>
        ) : null}
      </div>

      <div className="composer-footer settings-footer">
        <p>
          {connectionMessage ??
            (settingsDraft.provider === 'heuristic'
              ? 'Heuristic mode is useful only for UX testing. Switch to Ollama for more meaningful responses.'
              : 'Recommended local setup: Ollama + llama3.1:8b at http://127.0.0.1:11434/v1')}
        </p>
        <div className="action-row">
          <button className="ghost-button" type="button" disabled={testing} onClick={() => void onTestConnection()}>
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
          <button className="primary-button" type="button" disabled={saving} onClick={() => void onSave()}>
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </section>
  );
}

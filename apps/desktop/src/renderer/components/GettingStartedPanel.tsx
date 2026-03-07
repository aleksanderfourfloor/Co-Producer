import type { CoproducerState } from '@shared/types';

interface GettingStartedPanelProps {
  state: CoproducerState;
  onUseOllamaPreset: () => void;
  onUseDemoPrompt: () => void;
}

export function GettingStartedPanel({
  state,
  onUseOllamaPreset,
  onUseDemoPrompt
}: GettingStartedPanelProps): JSX.Element {
  const aiGeneric = state.settings.provider === 'heuristic';
  const bridgeConnected = state.bridgeStatus === 'connected';

  return (
    <section className="panel panel-start">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Start Here</p>
          <h2>What this app is doing right now</h2>
        </div>
      </div>

      <div className="start-grid">
        <article className="start-card">
          <span className="start-step">1</span>
          <strong>AI mode</strong>
          <p>
            {aiGeneric
              ? 'You are in heuristic fallback mode, so replies will feel generic.'
              : `You are using ${state.settings.provider} with model ${state.settings.model}.`}
          </p>
          {aiGeneric ? (
            <button className="ghost-button" type="button" onClick={onUseOllamaPreset}>
              Use Ollama preset
            </button>
          ) : null}
        </article>

        <article className="start-card">
          <span className="start-step">2</span>
          <strong>Ableton mode</strong>
          <p>
            {bridgeConnected
              ? 'Ableton bridge is connected, so plans can target the live set.'
              : 'You are still in mock mode. Ableton is not connected yet.'}
          </p>
          <p className="muted">
            To connect Live, load the Max for Live bridge scripts described in the bridge README.
          </p>
        </article>

        <article className="start-card">
          <span className="start-step">3</span>
          <strong>Useful first test</strong>
          <p>
            Try a concrete request instead of a general one so the assistant has to build a plan.
          </p>
          <button className="ghost-button" type="button" onClick={onUseDemoPrompt}>
            Load demo prompt
          </button>
        </article>
      </div>
    </section>
  );
}

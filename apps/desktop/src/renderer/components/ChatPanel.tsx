import type { CoproducerState } from '@shared/types';

interface ChatPanelProps {
  state: CoproducerState;
  message: string;
  isBusy: boolean;
  onMessageChange: (value: string) => void;
  onSend: () => Promise<void>;
  onRequestAnalysis: (target: 'selection' | 'master') => Promise<void>;
  onUsePrompt: (value: string) => void;
}

export function ChatPanel({
  state,
  message,
  isBusy,
  onMessageChange,
  onSend,
  onRequestAnalysis,
  onUsePrompt
}: ChatPanelProps): JSX.Element {
  return (
    <section className="panel panel-chat">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Session Copilot</p>
          <h2>In-session guidance</h2>
        </div>
        <div className="action-row">
          <button
            className="ghost-button"
            type="button"
            onClick={() => void onRequestAnalysis('selection')}
          >
            Analyze Selection
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => void onRequestAnalysis('master')}
          >
            Analyze Master
          </button>
        </div>
      </div>

      <div className="chat-stream">
        {state.chat.length === 0 ? (
          <div className="empty-state">
            <p>
              {state.settings.provider === 'heuristic'
                ? 'You are in heuristic mode, so keep prompts concrete. Best first test: ask for a specific track, clip length, and effect chain.'
                : 'Ask for arrangement feedback, a new musical idea, or a native Ableton effect chain.'}
            </p>
            <div className="chip-row">
              <button
                className="ghost-button"
                type="button"
                onClick={() =>
                  onUsePrompt('Add an 8 bar bass idea with saturation and a short reverb tail.')
                }
              >
                Try a bass prompt
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={() =>
                  onUsePrompt('Compare this set to my reference and tell me what is missing before the drop.')
                }
              >
                Try a reference prompt
              </button>
            </div>
          </div>
        ) : null}

        {state.chat.map((turn) => (
          <article
            key={turn.id}
            className={`chat-turn ${turn.role === 'assistant' ? 'chat-turn-assistant' : 'chat-turn-user'}`}
          >
            <header>
              <span>{turn.role === 'assistant' ? 'Co-Producer' : 'You'}</span>
              <time>{new Date(turn.createdAt).toLocaleTimeString()}</time>
            </header>
            <p>{turn.content}</p>
          </article>
        ))}
      </div>

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          void onSend();
        }}
      >
        <textarea
          value={message}
          onChange={(event) => onMessageChange(event.target.value)}
          rows={4}
          placeholder="Example: Add an 8 bar bass idea with saturation and a short reverb tail."
        />
        <div className="composer-footer">
          <p>
            {state.bridgeStatus === 'connected'
              ? 'Ableton bridge connected.'
              : 'Mock mode is active until the Max for Live bridge connects.'}{' '}
            {state.settings.provider === 'heuristic'
              ? 'AI is also in heuristic fallback mode.'
              : `AI provider: ${state.settings.provider}.`}
          </p>
          <button className="primary-button" disabled={isBusy || message.trim().length === 0} type="submit">
            {isBusy ? 'Thinking...' : 'Create Response'}
          </button>
        </div>
      </form>
    </section>
  );
}

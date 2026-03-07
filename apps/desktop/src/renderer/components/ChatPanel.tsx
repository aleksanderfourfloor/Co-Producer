import type { CoproducerState } from '@shared/types';

interface ChatPanelProps {
  state: CoproducerState;
  message: string;
  isBusy: boolean;
  onMessageChange: (value: string) => void;
  onSend: () => Promise<void>;
  onRequestAnalysis: (target: 'selection' | 'master') => Promise<void>;
}

export function ChatPanel({
  state,
  message,
  isBusy,
  onMessageChange,
  onSend,
  onRequestAnalysis
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
            <p>Ask for arrangement feedback, a new musical idea, or a native Ableton effect chain.</p>
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
              : 'Mock mode is active until the Max for Live bridge connects.'}
          </p>
          <button className="primary-button" disabled={isBusy || message.trim().length === 0} type="submit">
            {isBusy ? 'Thinking...' : 'Create Response'}
          </button>
        </div>
      </form>
    </section>
  );
}

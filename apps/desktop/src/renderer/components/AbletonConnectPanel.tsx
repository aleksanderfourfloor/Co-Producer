import type { BridgeInstallInfo, CoproducerState } from '@shared/types';

interface AbletonConnectPanelProps {
  state: CoproducerState;
  bridgeInfo?: BridgeInstallInfo;
  onCopyPath: (value: string) => Promise<void>;
}

export function AbletonConnectPanel({
  state,
  bridgeInfo,
  onCopyPath
}: AbletonConnectPanelProps): JSX.Element {
  const connected = state.bridgeStatus === 'connected';
  const targets = bridgeInfo ? [...bridgeInfo.targets] : [];

  return (
    <section className="panel panel-connect">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Ableton Link</p>
          <h2>Connect with one device</h2>
        </div>
        <span className={`status-pill status-${state.bridgeStatus}`}>
          {connected ? 'Connected' : 'Not connected'}
        </span>
      </div>

      <div className="connect-steps">
        <article className="connect-step">
          <span className="start-step">1</span>
          <div>
            <strong>Open Ableton Live</strong>
            <p>Create or open any Live set.</p>
          </div>
        </article>

        <article className="connect-step">
          <span className="start-step">2</span>
          <div>
            <strong>Choose a bridge target</strong>
            <p>Preferred long-term path: control surface. Current Max device remains experimental.</p>
          </div>
        </article>

        <article className="connect-step">
          <span className="start-step">3</span>
          <div>
            <strong>Wait for the status to turn connected</strong>
            <p>The desktop app should switch from mock mode to live mode automatically.</p>
          </div>
        </article>
      </div>

      {bridgeInfo ? (
        <div className="bridge-paths">
          {targets.map((target) => (
            <div key={target.kind} className="bridge-path-card">
              <span>
                {target.name} · {target.maturity}
              </span>
              <code>{target.entryPath}</code>
              <code>{target.folderPath}</code>
              <button
                className="ghost-button"
                type="button"
                onClick={() => void onCopyPath(target.entryPath)}
              >
                Copy entry path
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

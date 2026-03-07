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
            <strong>Drag one device into a MIDI track</strong>
            <p>Use the `Co-Producer Bridge.amxd` file from the bridge folder below.</p>
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
          <div className="bridge-path-card">
            <span>Bridge device</span>
            <code>{bridgeInfo.bridgeDevicePath}</code>
            <button
              className="ghost-button"
              type="button"
              onClick={() => void onCopyPath(bridgeInfo.bridgeDevicePath)}
            >
              Copy device path
            </button>
          </div>
          <div className="bridge-path-card">
            <span>Bridge folder</span>
            <code>{bridgeInfo.bridgeFolderPath}</code>
            <button
              className="ghost-button"
              type="button"
              onClick={() => void onCopyPath(bridgeInfo.bridgeFolderPath)}
            >
              Copy folder path
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

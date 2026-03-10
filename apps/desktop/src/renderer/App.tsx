import { startTransition, useEffect, useState } from 'react';
import { defaultAiSettings } from '@shared/settings';
import type {
  ActionPlan,
  AiConnectionTestResult,
  AiSettings,
  ApplyPlanResult,
  BridgeInstallInfo,
  BridgeInstallTarget,
  CoproducerState,
  TrackSummary
} from '@shared/types';
import { analyzeReferenceFile } from './audio';
import './styles.css';

function getSelectedTrack(state: CoproducerState): TrackSummary | undefined {
  const selection = state.snapshot.selection;

  if (selection.trackId) {
    return state.snapshot.tracks.find((track) => track.id === selection.trackId);
  }

  if (selection.trackIndex !== undefined) {
    return state.snapshot.tracks.find((track) => track.index === selection.trackIndex);
  }

  return undefined;
}

function getActiveSectionLabel(state: CoproducerState): string {
  const position = state.snapshot.transport.arrangementPositionBeats;
  const sortedLocators = [...state.snapshot.locators].sort((left, right) => left.beat - right.beat);
  let current = sortedLocators[0];

  for (const locator of sortedLocators) {
    if (locator.beat <= position) {
      current = locator;
      continue;
    }

    break;
  }

  return current?.name ?? 'No locator';
}

function getBridgeLabel(state: CoproducerState): string {
  const connectedLabel = state.bridgeKind === 'control_surface' ? 'Ableton control surface' : 'Ableton Max bridge';

  if (state.bridgeStatus === 'connected') {
    return connectedLabel;
  }

  if (state.bridgeStatus === 'syncing') {
    return `Syncing ${connectedLabel}`;
  }

  if (state.bridgeStatus === 'executing') {
    return `Executing via ${connectedLabel}`;
  }

  if (state.bridgeStatus === 'error') {
    return `${connectedLabel} error`;
  }

  if (state.bridgeStatus === 'mock') {
    return 'Mock session';
  }

  return 'Waiting for bridge';
}

function getBridgeMaturityLabel(state: CoproducerState): string {
  switch (state.bridgeMaturity) {
    case 'stable':
      return 'Stable';
    case 'preferred':
      return 'Preferred';
    case 'experimental':
      return 'Experimental';
    case 'planned':
      return 'Planned';
  }
}

function bridgeTargetSortValue(target: BridgeInstallTarget): number {
  switch (target.maturity) {
    case 'preferred':
      return 0;
    case 'stable':
      return 1;
    case 'experimental':
      return 2;
    case 'planned':
      return 3;
  }
}

function isBridgeLive(state: CoproducerState): boolean {
  return ['syncing', 'connected', 'executing'].includes(state.bridgeStatus);
}

function hasAuthoritativeWriteBridge(state: CoproducerState): boolean {
  return (
    isBridgeLive(state) &&
    state.bridgeAuthoritative &&
    state.bridgeCapabilities.includes('authoritative_write')
  );
}

function hasLiveApplyCapability(state: CoproducerState): boolean {
  return hasAuthoritativeWriteBridge(state);
}

function getApplyDisabledReason(state: CoproducerState): string | undefined {
  if (!isBridgeLive(state)) {
    return 'Ableton is disconnected. Reconnect the bridge and run self-test before applying this plan.';
  }

  if (isBridgeLive(state) && !hasLiveApplyCapability(state)) {
    return 'Live apply is disabled on the experimental Max bridge until self-test succeeds. Run bridge self-test, or install the control-surface bridge.';
  }

  return undefined;
}

function getExecutionStatusLabel(state: NonNullable<CoproducerState['lastExecution']>): string {
  switch (state.status) {
    case 'running':
      return 'Running';
    case 'succeeded':
      return 'Succeeded';
    case 'failed':
      return 'Failed';
    case 'suspect':
      return 'Suspect';
  }
}

function getAiLabel(settings: AiSettings): string {
  if (settings.provider === 'heuristic') {
    return 'Demo AI';
  }

  if (settings.provider === 'ollama') {
    return `Ollama: ${settings.model}`;
  }

  return settings.model;
}

export function App(): JSX.Element {
  const [state, setState] = useState<CoproducerState | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [importingReference, setImportingReference] = useState(false);
  const [applyingPlanId, setApplyingPlanId] = useState<string>();
  const [selectedCommands, setSelectedCommands] = useState<Record<string, number[]>>({});
  const [settingsDraft, setSettingsDraft] = useState<AiSettings>(defaultAiSettings);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [runningSelfTest, setRunningSelfTest] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState<string>();
  const [bridgeInfo, setBridgeInfo] = useState<BridgeInstallInfo>();
  const [setupOpen, setSetupOpen] = useState(true);
  const [planOpen, setPlanOpen] = useState(false);

  useEffect(() => {
    if (!window.coproducer) {
      setBootError('Desktop bridge API is unavailable. The Electron preload script did not load.');
      return;
    }

    let isMounted = true;

    window.coproducer.getBridgeInstallInfo().then((info) => {
      if (isMounted) {
        setBridgeInfo(info);
      }
    });

    window.coproducer
      .getState()
      .then((nextState) => {
        if (!isMounted) {
          return;
        }

        startTransition(() => {
          setState(nextState);
          setBootError(null);
          setSettingsDraft(nextState.settings);
          setSetupOpen(!hasLiveApplyCapability(nextState) || nextState.settings.provider === 'heuristic');
          setPlanOpen(nextState.pendingPlans.length > 0);
        });
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setBootError(error instanceof Error ? error.message : 'Failed to load desktop state.');
        }
      });

    const unsubscribe = window.coproducer.onStateChanged((nextState) => {
      startTransition(() => {
        setState(nextState);
        setBootError(null);
        setSettingsDraft(nextState.settings);
        setSetupOpen((current) => current || !hasLiveApplyCapability(nextState) || nextState.settings.provider === 'heuristic');
        if (nextState.pendingPlans.length > 0) {
          setPlanOpen(true);
        }
      });
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!state) {
      return;
    }

    setSelectedCommands((current) => {
      const next = { ...current };

      for (const plan of state.pendingPlans) {
        if (!next[plan.id]) {
          next[plan.id] = plan.commands.map((_, index) => index);
        }
      }

      for (const planId of Object.keys(next)) {
        if (!state.pendingPlans.some((plan) => plan.id === planId)) {
          delete next[planId];
        }
      }

      return next;
    });
  }, [state]);

  async function handleSend(): Promise<void> {
    if (!message.trim() || !window.coproducer) {
      return;
    }

    setBusy(true);
    try {
      await window.coproducer.sendMessage(message.trim());
      setMessage('');
    } finally {
      setBusy(false);
    }
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }

    event.preventDefault();
    if (!busy && message.trim().length > 0) {
      void handleSend();
    }
  }

  async function handleApplyPlan(plan: ActionPlan): Promise<void> {
    if (!state || !window.coproducer) {
      return;
    }

    const disabledReason = getApplyDisabledReason(state);
    if (disabledReason) {
      setConnectionMessage(disabledReason);
      return;
    }

    setApplyingPlanId(plan.id);

    try {
      const result: ApplyPlanResult = await window.coproducer.applyPlan({
        planId: plan.id,
        snapshotRevision: state.snapshot.setRevision,
        selectedCommandIndexes: selectedCommands[plan.id] ?? plan.commands.map((_, index) => index)
      });
      setConnectionMessage(result.message);
      if (result.accepted) {
        setPlanOpen(false);
      }
    } catch (error) {
      setConnectionMessage(error instanceof Error ? error.message : 'Failed to apply the current plan.');
    } finally {
      setApplyingPlanId(undefined);
    }
  }

  function handleToggleCommand(planId: string, commandIndex: number): void {
    setSelectedCommands((current) => {
      const existing = current[planId] ?? [];
      const next = existing.includes(commandIndex)
        ? existing.filter((index) => index !== commandIndex)
        : [...existing, commandIndex].sort((left, right) => left - right);

      return {
        ...current,
        [planId]: next
      };
    });
  }

  async function handleReferenceSelected(file: File): Promise<void> {
    if (!window.coproducer) {
      setBootError('Desktop bridge API is unavailable. The Electron preload script did not load.');
      return;
    }

    setImportingReference(true);

    try {
      const reference = await analyzeReferenceFile(file);
      await window.coproducer.saveReference(reference);
    } finally {
      setImportingReference(false);
    }
  }

  async function handleRequestAnalysis(target: 'selection' | 'master'): Promise<void> {
    if (!window.coproducer) {
      setBootError('Desktop bridge API is unavailable. The Electron preload script did not load.');
      return;
    }

    await window.coproducer.requestAnalysis(target);
  }

  async function handleSaveSettings(): Promise<void> {
    if (!window.coproducer) {
      setBootError('Desktop bridge API is unavailable. The Electron preload script did not load.');
      return;
    }

    setSavingSettings(true);

    try {
      await window.coproducer.updateSettings(settingsDraft);
      setConnectionMessage(`Saved ${settingsDraft.provider} settings.`);
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleTestConnection(): Promise<void> {
    if (!window.coproducer) {
      setBootError('Desktop bridge API is unavailable. The Electron preload script did not load.');
      return;
    }

    setTestingConnection(true);

    try {
      const result: AiConnectionTestResult = await window.coproducer.testModelConnection();
      setConnectionMessage(result.message);
    } finally {
      setTestingConnection(false);
    }
  }

  function handleUseOllamaPreset(): void {
    setSettingsDraft({
      ...defaultAiSettings,
      provider: 'ollama'
    });
    setConnectionMessage('Ollama preset loaded. Save settings, then test connection.');
  }

  async function handleCopyPath(value: string): Promise<void> {
    await navigator.clipboard.writeText(value);
    setConnectionMessage(`Copied path: ${value}`);
  }

  async function handleRunBridgeSelfTest(): Promise<void> {
    if (!window.coproducer) {
      setBootError('Desktop bridge API is unavailable. The Electron preload script did not load.');
      return;
    }

    setRunningSelfTest(true);

    try {
      const result = await window.coproducer.runBridgeSelfTest();
      setConnectionMessage(result.message);
    } catch (error) {
      setConnectionMessage(error instanceof Error ? error.message : 'Failed to run the bridge self-test.');
    } finally {
      setRunningSelfTest(false);
    }
  }

  if (bootError) {
    return (
      <main className="app-shell app-loading">
        <section className="boot-error-card">
          <p className="eyebrow">Renderer Boot Error</p>
          <h1>Co-Producer could not initialize</h1>
          <p>{bootError}</p>
        </section>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="app-shell app-loading">
        <p>Loading Co-Producer...</p>
      </main>
    );
  }

  const selectedTrack = getSelectedTrack(state);
  const activeSection = getActiveSectionLabel(state);
  const hasPendingPlan = state.pendingPlans.length > 0;
  const emptyChat = state.chat.length === 0;
  const demoMode = state.settings.provider === 'heuristic';
  const needSetup = !hasLiveApplyCapability(state) || demoMode;
  const execution = state.activeExecution ?? state.lastExecution;
  const applyDisabledReason = getApplyDisabledReason(state);

  return (
    <main className="app-shell minimal-shell">
      <header className="status-strip">
        <div className="status-brand">
          <p className="eyebrow">Co-Producer</p>
          <h1>Connect. Ask. Review. Apply.</h1>
        </div>
        <div className="status-items">
          <div className="status-card">
            <span className="status-label">AI</span>
            <strong>{getAiLabel(state.settings)}</strong>
          </div>
          <div className="status-card">
            <span className="status-label">Ableton</span>
            <strong>{getBridgeLabel(state)}</strong>
          </div>
          <div className="status-card">
            <span className="status-label">Track</span>
            <strong>{selectedTrack?.name ?? 'No track selected'}</strong>
          </div>
          <div className="status-card">
            <span className="status-label">Section</span>
            <strong>{activeSection}</strong>
          </div>
        </div>
      </header>

      <div className="top-actions">
        <button className="ghost-button" type="button" onClick={() => setSetupOpen((current) => !current)}>
          {setupOpen ? 'Hide setup' : needSetup ? 'Open setup' : 'Setup'}
        </button>
        <button
          className="ghost-button"
          type="button"
          onClick={() => setPlanOpen((current) => !current)}
          disabled={!hasPendingPlan}
        >
          {hasPendingPlan ? `Review plan (${state.pendingPlans.length})` : 'No plan yet'}
        </button>
      </div>

      {state.lastError ? <p className="error-banner">{state.lastError}</p> : null}

      {execution ? (
        <section className={`execution-trace-card execution-${execution.status}`}>
          <div className="execution-trace-header">
            <div>
              <p className="eyebrow">
                {execution.mode === 'self_test' ? 'Ableton self-test' : 'Execution trace'}
              </p>
              <h2>{getExecutionStatusLabel(execution)}</h2>
            </div>
            <span className={`status-pill status-${execution.status}`}>{execution.entries.length} events</span>
          </div>
          <p className="execution-summary">{execution.summary ?? 'Awaiting bridge telemetry.'}</p>
          <div className="execution-trace-list">
            {execution.entries.map((entry) => (
              <div key={entry.id} className={`execution-entry execution-entry-${entry.level}`}>
                <div className="execution-entry-meta">
                  <strong>{entry.kind}</strong>
                  <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                  {entry.commandIndex !== undefined ? <span>step {entry.commandIndex + 1}</span> : null}
                  {entry.commandType ? <code>{entry.commandType}</code> : null}
                </div>
                <p>{entry.message}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="chat-layout">
        <section className="chat-shell">
          {emptyChat ? (
            <div className="welcome-card">
              <p className="eyebrow">Start Here</p>
              <h2>Ask for one concrete production move.</h2>
              <p>
                {demoMode
                  ? 'You are in demo AI mode. It is useful for interface testing, but responses will stay limited until you connect a real model.'
                  : 'AI is connected. Ask for arrangement help, a new musical part, or a specific Ableton-native chain.'}
              </p>
              <div className="quick-actions">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() =>
                    setMessage('Add an 8-bar bass idea under the selected section with Operator and light saturation.')
                  }
                >
                  Bass prompt
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() =>
                    setMessage('Tell me what the selected track is missing before the drop and propose a short plan.')
                  }
                >
                  Arrangement prompt
                </button>
                <button className="ghost-button" type="button" onClick={() => setSetupOpen(true)}>
                  Setup AI and Ableton
                </button>
              </div>
            </div>
          ) : null}

          <div className="chat-stream minimal-chat-stream">
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

          <div className="chat-toolbar">
            <button className="ghost-button" type="button" onClick={() => void handleRequestAnalysis('selection')}>
              Analyze selection
            </button>
            <button className="ghost-button" type="button" onClick={() => void handleRequestAnalysis('master')}>
              Analyze master
            </button>
            <label className="ghost-button upload-button">
              {importingReference ? 'Importing reference...' : 'Import reference'}
              <input
                type="file"
                accept="audio/*"
                disabled={importingReference}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void handleReferenceSelected(file);
                  }
                  event.currentTarget.value = '';
                }}
              />
            </label>
          </div>

          <form
            className="composer minimal-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSend();
            }}
          >
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              rows={3}
              placeholder="Example: Add an 8-bar bass idea on the selected track with Operator, Saturator, and a tight sidechain feel."
            />
            <div className="composer-footer">
              <p>
                {demoMode
                  ? 'Demo AI is active. Connect a real model for meaningful responses.'
                  : `Using ${getAiLabel(state.settings)}.`}{' '}
                {isBridgeLive(state)
                  ? 'Ableton bridge is available for Live actions.'
                  : 'Ableton is not connected yet, so Live actions are paused until reconnection.'}
              </p>
              <button className="primary-button" disabled={busy || message.trim().length === 0} type="submit">
                {busy ? 'Thinking...' : 'Send'}
              </button>
            </div>
          </form>
        </section>

        {setupOpen ? (
          <aside className="side-drawer">
            <section className="drawer-card">
              <div className="drawer-header">
                <div>
                  <p className="eyebrow">Setup</p>
                  <h2>Get to a real test quickly</h2>
                </div>
                <button className="ghost-button" type="button" onClick={() => setSetupOpen(false)}>
                  Close
                </button>
              </div>

              <div className="setup-block">
                <h3>1. Connect AI</h3>
                <p>
                  Demo AI is not meant for serious testing. Recommended local setup: Ollama with `llama3.1:8b`.
                </p>
                <div className="quick-actions">
                  <button className="ghost-button" type="button" onClick={handleUseOllamaPreset}>
                    Use Ollama preset
                  </button>
                </div>
                <label className="field">
                  <span>Provider</span>
                  <select
                    value={settingsDraft.provider}
                    onChange={(event) =>
                      setSettingsDraft({
                        ...settingsDraft,
                        provider: event.target.value as AiSettings['provider']
                      })
                    }
                  >
                    <option value="heuristic">Demo AI</option>
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
                      setSettingsDraft({
                        ...settingsDraft,
                        model: event.target.value
                      })
                    }
                    placeholder="llama3.1:8b"
                  />
                </label>
                {settingsDraft.provider !== 'heuristic' ? (
                  <label className="field">
                    <span>Base URL</span>
                    <input
                      type="text"
                      value={settingsDraft.baseUrl}
                      onChange={(event) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          baseUrl: event.target.value
                        })
                      }
                      placeholder="http://127.0.0.1:11434/v1"
                    />
                  </label>
                ) : null}
                <div className="action-row">
                  <button
                    className="ghost-button"
                    type="button"
                    disabled={runningSelfTest || !isBridgeLive(state)}
                    onClick={() => void handleRunBridgeSelfTest()}
                  >
                    {runningSelfTest ? 'Running self-test...' : 'Run bridge self-test'}
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    disabled={testingConnection}
                    onClick={() => void handleTestConnection()}
                  >
                    {testingConnection ? 'Testing...' : 'Test AI'}
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    disabled={savingSettings}
                    onClick={() => void handleSaveSettings()}
                  >
                    {savingSettings ? 'Saving...' : 'Save AI settings'}
                  </button>
                </div>
              </div>

              <div className="setup-block">
                <h3>2. Connect Ableton</h3>
                <p>
                  Recommended direction: the control-surface bridge will become the authoritative write path.
                  The Max for Live bridge remains experimental for now.
                </p>
                {isBridgeLive(state) && !hasLiveApplyCapability(state) ? (
                  <p className="muted">
                    The current Ableton connection is live for sync and diagnostics. Run bridge self-test successfully
                    to enable live apply on this experimental bridge, or install the control-surface bridge.
                  </p>
                ) : null}
                {bridgeInfo ? (
                  <div className="path-list">
                    {[...bridgeInfo.targets]
                      .sort((left, right) => bridgeTargetSortValue(left) - bridgeTargetSortValue(right))
                      .map((target) => (
                        <div key={target.kind} className="path-card">
                          <span>
                            {target.name} · {target.maturity}
                          </span>
                          <p>{target.description}</p>
                          <code>{target.entryPath}</code>
                          <code>{target.folderPath}</code>
                          <p>{target.installHint}</p>
                          <div className="quick-actions">
                            <button
                              className="ghost-button"
                              type="button"
                              onClick={() => void handleCopyPath(target.entryPath)}
                            >
                              Copy entry path
                            </button>
                            <button
                              className="ghost-button"
                              type="button"
                              onClick={() => void handleCopyPath(target.folderPath)}
                            >
                              Copy folder path
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                ) : null}
              </div>

              <div className="setup-block compact-note">
                <h3>Current state</h3>
                <p>{connectionMessage ?? 'No recent setup action.'}</p>
                <p>
                  AI: {getAiLabel(state.settings)}. Ableton: {getBridgeLabel(state)} ({getBridgeMaturityLabel(state)}).
                </p>
                <p>
                  {hasLiveApplyCapability(state)
                    ? 'Live apply is enabled.'
                    : isBridgeLive(state)
                      ? 'Live apply is disabled until self-test succeeds on the current bridge.'
                      : 'No authoritative Ableton write bridge is connected.'}
                </p>
              </div>
            </section>
          </aside>
        ) : null}

        {planOpen && hasPendingPlan ? (
          <aside className="side-drawer">
            <section className="drawer-card">
              <div className="drawer-header">
                <div>
                  <p className="eyebrow">Review</p>
                  <h2>Action plan</h2>
                </div>
                <button className="ghost-button" type="button" onClick={() => setPlanOpen(false)}>
                  Close
                </button>
              </div>

              {state.pendingPlans.map((plan) => (
                <article key={plan.id} className="plan-card">
                  <header className="plan-header">
                    <div>
                      <h3>{plan.title}</h3>
                      <p>{plan.summary}</p>
                    </div>
                    <span className="status-pill">{plan.commands.length} steps</span>
                  </header>
                  <p className="plan-rationale">{plan.rationale}</p>
                  <div className="plan-command-list">
                    {plan.commands.map((command, index) => {
                      const selected = (selectedCommands[plan.id] ?? []).includes(index);

                      return (
                        <label key={`${plan.id}-${index}`} className={`command-row ${selected ? 'command-row-selected' : ''}`}>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => handleToggleCommand(plan.id, index)}
                          />
                          <span>{command.type}</span>
                        </label>
                      );
                    })}
                  </div>
                  {applyDisabledReason ? <p className="muted">{applyDisabledReason}</p> : null}
                  <button
                    className="primary-button plan-apply-button"
                    type="button"
                    disabled={applyingPlanId === plan.id || Boolean(applyDisabledReason)}
                    onClick={() => void handleApplyPlan(plan)}
                  >
                    {applyingPlanId === plan.id ? 'Applying...' : 'Apply selected steps'}
                  </button>
                </article>
              ))}
            </section>
          </aside>
        ) : null}
      </section>
    </main>
  );
}

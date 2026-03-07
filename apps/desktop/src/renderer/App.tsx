import { startTransition, useEffect, useState } from 'react';
import type { ActionPlan, CoproducerState } from '@shared/types';
import { ChatPanel } from './components/ChatPanel';
import { ContextPanel } from './components/ContextPanel';
import { PlanPanel } from './components/PlanPanel';
import { analyzeReferenceFile } from './audio';
import './styles.css';

export function App(): JSX.Element {
  const [state, setState] = useState<CoproducerState | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [importingReference, setImportingReference] = useState(false);
  const [applyingPlanId, setApplyingPlanId] = useState<string>();
  const [selectedCommands, setSelectedCommands] = useState<Record<string, number[]>>({});

  useEffect(() => {
    if (!window.coproducer) {
      setBootError('Desktop bridge API is unavailable. The Electron preload script did not load.');
      return;
    }

    let isMounted = true;
    window.coproducer
      .getState()
      .then((nextState) => {
        if (isMounted) {
          startTransition(() => {
            setState(nextState);
            setBootError(null);
          });
        }
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

  async function handleApplyPlan(plan: ActionPlan): Promise<void> {
    if (!state || !window.coproducer) {
      return;
    }

    setApplyingPlanId(plan.id);
    try {
      await window.coproducer.applyPlan({
        planId: plan.id,
        snapshotRevision: state.snapshot.setRevision,
        selectedCommandIndexes: selectedCommands[plan.id] ?? plan.commands.map((_, index) => index)
      });
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

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Ableton Co-Producer</p>
          <h1>Context-aware production assistance inside the Live workflow</h1>
        </div>
        <div className="header-meta">
          <span className={`status-pill status-${state.bridgeStatus}`}>
            {state.bridgeStatus === 'connected' ? 'Bridge Connected' : 'Mock Session'}
          </span>
          {state.lastError ? <p className="error-banner">{state.lastError}</p> : null}
        </div>
      </header>

      <section className="workspace-grid">
        <ChatPanel
          isBusy={busy}
          message={message}
          onMessageChange={setMessage}
          onRequestAnalysis={handleRequestAnalysis}
          onSend={handleSend}
          state={state}
        />
        <div className="sidebar-grid">
          <ContextPanel
            importingReference={importingReference}
            onReferenceSelected={handleReferenceSelected}
            state={state}
          />
          <PlanPanel
            applyingPlanId={applyingPlanId}
            onApplyPlan={handleApplyPlan}
            onToggleCommand={handleToggleCommand}
            plans={state.pendingPlans}
            selectedCommands={selectedCommands}
          />
        </div>
      </section>
    </main>
  );
}

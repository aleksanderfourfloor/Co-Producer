import { EventEmitter } from 'node:events';
import type {
  ActionPlan,
  AiConnectionTestResult,
  AiSettings,
  AnalysisTarget,
  ApplyPlanRequest,
  ApplyPlanResult,
  ChatTurn,
  ContextSnapshot,
  CoproducerState,
  ExecutionTrace,
  ExecutionTraceEntry,
  ReferenceAnalysis
} from '@shared/types';
import { mockSnapshot } from '@shared/mock-data';
import { CoproducerService, SessionStore, applyCommandsToSnapshot, createId } from '@core/index';
import { BridgeServer } from './bridge-server';

interface ControllerEvents {
  stateChanged: [state: CoproducerState];
}

export class DesktopController extends EventEmitter<ControllerEvents> {
  private readonly store: SessionStore;
  private readonly service = new CoproducerService();
  private readonly bridgeServer = new BridgeServer();
  private snapshotPollTimer?: NodeJS.Timeout;
  private snapshotWaiters: Array<{
    previousRevision: string;
    resolve: (snapshot?: ContextSnapshot) => void;
    timeout: NodeJS.Timeout;
  }> = [];
  private readonly bridgePort: number;

  constructor(initialSettings?: AiSettings, bridgePort = 49741) {
    super();
    this.store = new SessionStore(mockSnapshot, 'waiting');
    this.bridgePort = bridgePort;
    if (initialSettings) {
      this.store.updateSettings(initialSettings);
    }
  }

  start(): void {
    this.bridgeServer.on('hello', (message) => {
      this.store.setBridgeStatus('syncing', message.version);
      this.store.setError(undefined);
      this.startSnapshotPolling();
      this.broadcastState();
      this.bridgeServer.requestSnapshot();
    });

    this.bridgeServer.on('snapshot', (message) => {
      this.store.upsertSnapshot(message.snapshot);
      this.resolveSnapshotWaiters(message.snapshot);
      if (!this.store.getState().activeExecution) {
        this.store.setBridgeStatus('connected');
      }
      this.broadcastState();
    });

    this.bridgeServer.on('analysis', (message) => {
      const snapshot = structuredClone(this.store.getState().snapshot);
      if (message.target === 'master' || message.target === 'selection') {
        snapshot.analysis = {
          ...snapshot.analysis,
          [message.target]: message.features
        };
        this.store.upsertSnapshot({
          ...snapshot,
          id: createId('snapshot'),
          capturedAt: new Date().toISOString(),
          setRevision: createId('rev')
        });
      }
      this.addAssistantTurn(
        `Finished ${message.target} analysis for ${message.sourceLabel}. ${message.features.notes?.join('. ') ?? 'No additional notes were produced.'}`
      );
      this.broadcastState();
    });

    this.bridgeServer.on('commandStarted', (message) => {
      const activeExecution = this.store.getState().activeExecution;
      if (!activeExecution || activeExecution.planId !== message.planId) {
        this.store.startExecution(this.createExecutionTrace(message.planId, message.source === 'self_test' ? 'self_test' : 'bridge'));
      }
      this.store.setBridgeStatus('executing');
      this.store.appendExecutionEntry(
        this.createExecutionEntry(message.planId, {
          kind: 'batch',
          level: 'info',
          message: message.message
        })
      );
      this.broadcastState();
    });

    this.bridgeServer.on('commandStep', (message) => {
      this.store.appendExecutionEntry(
        this.createExecutionEntry(message.planId, {
          kind: 'step',
          level: message.ok ? 'success' : 'error',
          message: message.message,
          commandIndex: message.commandIndex,
          commandType: message.commandType,
          ok: message.ok,
          commandPayload: message.command
        })
      );
      this.broadcastState();
    });

    this.bridgeServer.on('errorMessage', (message) => {
      if (message.planId) {
        this.store.appendExecutionEntry(
          this.createExecutionEntry(message.planId, {
            kind: 'error',
            level: 'error',
            message: message.message,
            commandIndex: message.commandIndex,
            commandType: message.commandType,
            code: message.code
          })
        );
      }
      this.store.setError(message.message);
      this.store.setBridgeStatus('error', this.store.getState().bridgeVersion);
      if (!message.planId) {
        this.addAssistantTurn(`Bridge error: ${message.message}`);
      }
      this.broadcastState();
    });

    this.bridgeServer.on('disconnected', () => {
      this.stopSnapshotPolling();
      this.resolveSnapshotWaiters();
      const activeExecution = this.store.getState().activeExecution;
      if (activeExecution) {
        this.store.finishExecution(activeExecution.planId, {
          finishedAt: new Date().toISOString(),
          status: 'failed',
          summary: 'Bridge disconnected during execution.',
          entries: [
            ...activeExecution.entries,
            this.createExecutionEntry(activeExecution.planId, {
              kind: 'error',
              level: 'error',
              message: 'Ableton bridge disconnected during execution.'
            })
          ]
        });
      }
      this.store.setBridgeStatus('mock');
      this.store.setError('Ableton bridge disconnected. Falling back to mock mode.');
      this.addAssistantTurn('Ableton bridge disconnected. Falling back to mock mode.');
      this.broadcastState();
    });

    this.bridgeServer.start(this.bridgePort);
  }

  stop(): void {
    this.stopSnapshotPolling();
    this.resolveSnapshotWaiters();
    this.bridgeServer.stop();
  }

  getState(): CoproducerState {
    return this.store.getState();
  }

  async sendMessage(message: string): Promise<CoproducerState> {
    this.store.addChatTurn(this.userTurn(message));
    const currentState = this.store.getState();
    const response = await this.service.createReply(
      message,
      currentState.snapshot,
      currentState.references,
      currentState.settings,
      currentState.chat
    );

    if (response.plan) {
      this.store.addPlan(response.plan);
    }

    const extraNotes = [
      response.plan ? 'Review the action plan and click Apply selected steps to execute it in Ableton Live.' : undefined,
      response.warning,
      response.source === 'model' ? 'Model-backed response.' : undefined
    ]
      .filter((value): value is string => Boolean(value))
      .join(' ');

    this.store.addChatTurn({
      id: createId('chat'),
      role: 'assistant',
      content: extraNotes ? `${response.reply}\n\n${extraNotes}` : response.reply,
      createdAt: new Date().toISOString(),
      relatedPlanId: response.plan?.id
    });

    this.broadcastState();
    return this.store.getState();
  }

  updateSettings(settings: AiSettings): CoproducerState {
    this.store.updateSettings(settings);
    this.store.setError(undefined);
    this.broadcastState();
    return this.store.getState();
  }

  async testModelConnection(): Promise<AiConnectionTestResult> {
    const state = this.store.getState();
    const result = await this.service.testConnection(state.settings);
    this.store.setError(result.ok ? undefined : result.message);
    this.addAssistantTurn(result.message);
    this.broadcastState();
    return result;
  }

  async applyPlan(request: ApplyPlanRequest): Promise<ApplyPlanResult> {
    const state = this.store.getState();
    const validation = this.service.validateApplyPlan(request, state);

    if (!validation.result.accepted || !validation.plan) {
      this.store.setError(validation.result.message);
      this.addAssistantTurn(validation.result.message);
      this.broadcastState();
      return validation.result;
    }

    const selectedCommands = validation.plan.commands.filter((_, index) =>
      validation.result.executedCommandIndexes.includes(index)
    );

    if (this.bridgeServer.isConnected()) {
      const executionPlan: ActionPlan = {
        ...validation.plan,
        commands: selectedCommands
      };
      const previousRevision = state.snapshot.setRevision;
      this.store.startExecution(this.createExecutionTrace(validation.plan.id, 'bridge', previousRevision));
      this.store.setBridgeStatus('executing', state.bridgeVersion);
      this.store.setError(undefined);
      this.store.appendExecutionEntry(
        this.createExecutionEntry(validation.plan.id, {
          kind: 'batch',
          level: 'info',
          message: `Dispatching ${selectedCommands.length} command(s) to Ableton Live.`
        })
      );
      this.broadcastState();

      try {
        const result = await this.bridgeServer.executePlan(executionPlan);
        let finalResult = result;
        let traceStatus: ExecutionTrace['status'] = result.accepted ? 'succeeded' : 'failed';
        let nextBridgeStatus: CoproducerState['bridgeStatus'] = result.accepted ? 'connected' : 'error';
        const traceEntries = [...(this.store.getState().activeExecution?.entries ?? [])];

        traceEntries.push(
          this.createExecutionEntry(validation.plan.id, {
            kind: 'result',
            level: result.accepted ? 'success' : 'error',
            message: result.message,
            commandIndex: result.failedCommandIndex,
            commandType: result.failedCommandType,
            ok: result.accepted
          })
        );

        if (result.accepted) {
          try {
            this.bridgeServer.requestSnapshot();
          } catch (error) {
            const message =
              error instanceof Error ? error.message : 'Applied commands, but failed to request a follow-up snapshot.';
            traceEntries.push(
              this.createExecutionEntry(validation.plan.id, {
                kind: 'error',
                level: 'warning',
                message
              })
            );
          }

          const confirmedSnapshot = await this.waitForSnapshotChange(previousRevision, 2000);
          const snapshotConfirmed = Boolean(confirmedSnapshot);
          finalResult = {
            ...result,
            snapshotConfirmed,
            suspect: !snapshotConfirmed
          };
          traceEntries.push(
            this.createExecutionEntry(validation.plan.id, {
              kind: 'snapshot',
              level: snapshotConfirmed ? 'success' : 'warning',
              message: snapshotConfirmed
                ? `Confirmed a fresh Ableton snapshot (${confirmedSnapshot?.setRevision}).`
                : 'Bridge reported success, but no fresh Ableton snapshot arrived to confirm the mutation.'
            })
          );
          this.store.clearPlan(validation.plan.id);
          if (snapshotConfirmed) {
            this.store.setError(undefined);
            this.addAssistantTurn(`Applied ${result.executedCommandIndexes.length} command(s) in Ableton.`);
          } else {
            traceStatus = 'suspect';
            nextBridgeStatus = 'error';
            this.store.setError(
              'Ableton reported success, but the desktop app did not receive a confirming snapshot change.'
            );
            this.addAssistantTurn(
              'Ableton reported success, but the desktop app did not receive a confirming snapshot change.'
            );
          }
        } else {
          this.store.setError(result.message);
          this.addAssistantTurn(result.message);
        }

        this.store.finishExecution(validation.plan.id, {
          finishedAt: new Date().toISOString(),
          status: traceStatus,
          summary: finalResult.message,
          snapshotRevisionAfter: this.store.getState().snapshot.setRevision,
          entries: traceEntries
        });
        this.store.setBridgeStatus(nextBridgeStatus, state.bridgeVersion);
        this.broadcastState();
        return finalResult;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to dispatch the plan to the Ableton bridge.';
        const failure: ApplyPlanResult = {
          planId: validation.plan.id,
          accepted: false,
          message,
          executedCommandIndexes: []
        };
        this.store.appendExecutionEntry(
          this.createExecutionEntry(validation.plan.id, {
            kind: 'error',
            level: 'error',
            message
          })
        );
        this.store.finishExecution(validation.plan.id, {
          finishedAt: new Date().toISOString(),
          status: 'failed',
          summary: message
        });
        this.store.setBridgeStatus('error', state.bridgeVersion);
        this.store.setError(message);
        this.addAssistantTurn(message);
        this.broadcastState();
        return failure;
      }
    }

    const nextSnapshot = applyCommandsToSnapshot(state.snapshot, selectedCommands);
    this.store.startExecution(this.createExecutionTrace(validation.plan.id, 'mock', state.snapshot.setRevision));
    this.store.appendExecutionEntry(
      this.createExecutionEntry(validation.plan.id, {
        kind: 'batch',
        level: 'info',
        message: `Applying ${selectedCommands.length} command(s) in mock mode.`
      })
    );
    this.store.upsertSnapshot(nextSnapshot);
    this.store.clearPlan(validation.plan.id);
    this.store.setError(undefined);
    this.store.finishExecution(validation.plan.id, {
      finishedAt: new Date().toISOString(),
      status: 'succeeded',
      summary: 'Plan applied in mock mode.',
      snapshotRevisionAfter: nextSnapshot.setRevision,
      entries: [
        ...(this.store.getState().activeExecution?.entries ?? []),
        this.createExecutionEntry(validation.plan.id, {
          kind: 'result',
          level: 'success',
          message: 'Plan applied in mock mode.',
          ok: true
        })
      ]
    });
    this.store.setBridgeStatus('mock', state.bridgeVersion);
    this.addAssistantTurn(
      `Applied ${selectedCommands.length} command(s) in mock mode. Reconnect the Ableton bridge to target the live set.`
    );
    this.broadcastState();

    return {
      planId: validation.plan.id,
      accepted: true,
      message: 'Plan applied in mock mode.',
      executedCommandIndexes: validation.result.executedCommandIndexes,
      snapshotConfirmed: true
    };
  }

  saveReference(reference: ReferenceAnalysis): CoproducerState {
    this.store.addReference(reference);
    const notes = reference.features.notes?.join('. ');
    this.addAssistantTurn(
      `Imported ${reference.fileName} for reference analysis. ${notes ?? 'Reference features are now available for comparison.'}`
    );
    this.broadcastState();
    return this.store.getState();
  }

  requestAnalysis(target: AnalysisTarget, prompt?: string): CoproducerState {
    if (this.bridgeServer.isConnected()) {
      this.bridgeServer.requestAnalysis(this.service.createSelectionAnalysisRequest(target, prompt));
      this.addAssistantTurn(`Requested ${target} analysis from Ableton.`);
      this.broadcastState();
      return this.store.getState();
    }

    const snapshot = this.store.getState().snapshot;
    const analysis = target === 'selection' ? snapshot.analysis?.selection : snapshot.analysis?.master;
    if (analysis) {
      this.addAssistantTurn(
        `${target === 'selection' ? 'Selection' : 'Master'} analysis is already available for ${analysis.sourceLabel}. ${analysis.notes?.join('. ') ?? ''}`.trim()
      );
    } else {
      this.addAssistantTurn(
        `No ${target} audio analysis is available in mock mode. Connect the Max for Live bridge to analyze the live set audio.`
      );
    }
    this.broadcastState();
    return this.store.getState();
  }

  async runBridgeSelfTest(): Promise<ApplyPlanResult> {
    const state = this.store.getState();
    if (!this.bridgeServer.isConnected()) {
      const result: ApplyPlanResult = {
        planId: createId('self-test'),
        accepted: false,
        message: 'Ableton bridge is not connected. Connect the Max for Live device before running the self-test.',
        executedCommandIndexes: []
      };
      this.store.setError(result.message);
      this.addAssistantTurn(result.message);
      this.broadcastState();
      return result;
    }

    const planId = createId('self-test');
    const previousRevision = state.snapshot.setRevision;
    this.store.startExecution(this.createExecutionTrace(planId, 'self_test', previousRevision));
    this.store.setBridgeStatus('executing', state.bridgeVersion);
    this.store.setError(undefined);
    this.store.appendExecutionEntry(
      this.createExecutionEntry(planId, {
        kind: 'batch',
        level: 'info',
        message: 'Dispatching Ableton bridge self-test.'
      })
    );
    this.broadcastState();

    try {
      const result = await this.bridgeServer.runSelfTest(planId);
      const traceEntries = [...(this.store.getState().activeExecution?.entries ?? [])];
      traceEntries.push(
        this.createExecutionEntry(planId, {
          kind: 'result',
          level: result.accepted ? 'success' : 'error',
          message: result.message,
          commandIndex: result.failedCommandIndex,
          commandType: result.failedCommandType,
          ok: result.accepted
        })
      );

      let finalResult = result;
      let traceStatus: ExecutionTrace['status'] = result.accepted ? 'succeeded' : 'failed';
      let nextBridgeStatus: CoproducerState['bridgeStatus'] = result.accepted ? 'connected' : 'error';

      if (result.accepted) {
        try {
          this.bridgeServer.requestSnapshot();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Self-test completed, but follow-up snapshot request failed.';
          traceEntries.push(
            this.createExecutionEntry(planId, {
              kind: 'error',
              level: 'warning',
              message
            })
          );
        }
        const confirmedSnapshot = await this.waitForSnapshotChange(previousRevision, 2500);
        const snapshotConfirmed = Boolean(confirmedSnapshot);
        finalResult = {
          ...result,
          snapshotConfirmed,
          suspect: !snapshotConfirmed
        };
        traceEntries.push(
          this.createExecutionEntry(planId, {
            kind: 'snapshot',
            level: snapshotConfirmed ? 'success' : 'warning',
            message: snapshotConfirmed
              ? `Self-test confirmed with a fresh Ableton snapshot (${confirmedSnapshot?.setRevision}).`
              : 'Self-test reported success, but no confirming snapshot arrived.'
          })
        );
        if (!snapshotConfirmed) {
          traceStatus = 'suspect';
          nextBridgeStatus = 'error';
          this.store.setError('Ableton bridge self-test reported success without a confirming snapshot change.');
        }
      } else {
        this.store.setError(result.message);
      }

      this.store.finishExecution(planId, {
        finishedAt: new Date().toISOString(),
        status: traceStatus,
        summary: finalResult.message,
        snapshotRevisionAfter: this.store.getState().snapshot.setRevision,
        entries: traceEntries
      });
      this.store.setBridgeStatus(nextBridgeStatus, state.bridgeVersion);
      this.addAssistantTurn(finalResult.message);
      this.broadcastState();
      return finalResult;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to dispatch the Ableton bridge self-test.';
      const failure: ApplyPlanResult = {
        planId,
        accepted: false,
        message,
        executedCommandIndexes: []
      };
      this.store.appendExecutionEntry(
        this.createExecutionEntry(planId, {
          kind: 'error',
          level: 'error',
          message
        })
      );
      this.store.finishExecution(planId, {
        finishedAt: new Date().toISOString(),
        status: 'failed',
        summary: message
      });
      this.store.setBridgeStatus('error', state.bridgeVersion);
      this.store.setError(message);
      this.addAssistantTurn(message);
      this.broadcastState();
      return failure;
    }
  }

  private broadcastState(): void {
    this.emit('stateChanged', this.store.getState());
  }

  private startSnapshotPolling(): void {
    this.stopSnapshotPolling();
    this.snapshotPollTimer = setInterval(() => {
      if (!this.bridgeServer.isConnected()) {
        return;
      }

      try {
        this.bridgeServer.requestSnapshot();
      } catch {
        // Ignore transient bridge errors here; the disconnect event will reconcile state.
      }
    }, 1500);
  }

  private stopSnapshotPolling(): void {
    if (!this.snapshotPollTimer) {
      return;
    }

    clearInterval(this.snapshotPollTimer);
    this.snapshotPollTimer = undefined;
  }

  private addAssistantTurn(content: string): void {
    this.store.addChatTurn({
      id: createId('chat'),
      role: 'assistant',
      content,
      createdAt: new Date().toISOString()
    });
  }

  private userTurn(content: string): ChatTurn {
    return {
      id: createId('chat'),
      role: 'user',
      content,
      createdAt: new Date().toISOString()
    };
  }

  private createExecutionTrace(
    planId: string,
    mode: ExecutionTrace['mode'],
    snapshotRevisionBefore?: string
  ): ExecutionTrace {
    return {
      planId,
      mode,
      status: 'running',
      startedAt: new Date().toISOString(),
      snapshotRevisionBefore,
      entries: []
    };
  }

  private createExecutionEntry(
    planId: string,
    entry: Omit<ExecutionTraceEntry, 'id' | 'planId' | 'timestamp'>
  ): ExecutionTraceEntry {
    return {
      id: createId('trace'),
      planId,
      timestamp: new Date().toISOString(),
      ...entry
    };
  }

  private waitForSnapshotChange(previousRevision: string, timeoutMs: number): Promise<ContextSnapshot | undefined> {
    const currentSnapshot = this.store.getState().snapshot;
    if (currentSnapshot.setRevision !== previousRevision) {
      return Promise.resolve(currentSnapshot);
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.snapshotWaiters = this.snapshotWaiters.filter((waiter) => waiter.timeout !== timeout);
        resolve(undefined);
      }, timeoutMs);

      this.snapshotWaiters.push({
        previousRevision,
        resolve,
        timeout
      });
    });
  }

  private resolveSnapshotWaiters(snapshot?: ContextSnapshot): void {
    const remaining: typeof this.snapshotWaiters = [];

    for (const waiter of this.snapshotWaiters) {
      if (!snapshot) {
        clearTimeout(waiter.timeout);
        waiter.resolve(undefined);
        continue;
      }

      if (snapshot.setRevision !== waiter.previousRevision) {
        clearTimeout(waiter.timeout);
        waiter.resolve(snapshot);
        continue;
      }

      remaining.push(waiter);
    }

    this.snapshotWaiters = remaining;
  }
}

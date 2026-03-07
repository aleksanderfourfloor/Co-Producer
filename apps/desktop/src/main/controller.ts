import { EventEmitter } from 'node:events';
import type {
  ActionPlan,
  AnalysisTarget,
  ApplyPlanRequest,
  ApplyPlanResult,
  ChatTurn,
  ContextSnapshot,
  CoproducerState,
  ReferenceAnalysis
} from '@shared/types';
import { mockSnapshot } from '@shared/mock-data';
import { CoproducerService, SessionStore, applyCommandsToSnapshot, createId } from '@core/index';
import { BridgeServer } from './bridge-server';

interface ControllerEvents {
  stateChanged: [state: CoproducerState];
}

export class DesktopController extends EventEmitter<ControllerEvents> {
  private readonly store = new SessionStore(mockSnapshot, 'mock');
  private readonly service = new CoproducerService();
  private readonly bridgeServer = new BridgeServer();

  start(): void {
    this.bridgeServer.on('hello', (message) => {
      this.store.setBridgeStatus('connected', message.version);
      this.store.setError(undefined);
      this.broadcastState();
      this.bridgeServer.requestSnapshot();
    });

    this.bridgeServer.on('snapshot', (message) => {
      this.store.upsertSnapshot(message.snapshot);
      this.store.setBridgeStatus('connected');
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

    this.bridgeServer.on('errorMessage', (message) => {
      this.store.setError(message.message);
      this.addAssistantTurn(`Bridge error: ${message.message}`);
      this.broadcastState();
    });

    this.bridgeServer.on('disconnected', () => {
      this.store.setBridgeStatus('mock');
      this.store.setError('Ableton bridge disconnected. Falling back to mock mode.');
      this.broadcastState();
    });

    this.bridgeServer.start();
  }

  stop(): void {
    this.bridgeServer.stop();
  }

  getState(): CoproducerState {
    return this.store.getState();
  }

  sendMessage(message: string): CoproducerState {
    this.store.addChatTurn(this.userTurn(message));
    const currentState = this.store.getState();
    const response = this.service.createReply(
      message,
      currentState.snapshot,
      currentState.references
    );

    if (response.plan) {
      this.store.addPlan(response.plan);
    }

    this.store.addChatTurn({
      id: createId('chat'),
      role: 'assistant',
      content: response.reply,
      createdAt: new Date().toISOString(),
      relatedPlanId: response.plan?.id
    });

    this.broadcastState();
    return this.store.getState();
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

    if (state.bridgeStatus === 'connected' && this.bridgeServer.isConnected()) {
      const executionPlan: ActionPlan = {
        ...validation.plan,
        commands: selectedCommands
      };
      const result = await this.bridgeServer.executePlan(executionPlan);

      if (result.accepted) {
        this.store.clearPlan(validation.plan.id);
        this.store.setError(undefined);
        this.addAssistantTurn(`Applied ${result.executedCommandIndexes.length} command(s) in Ableton.`);
        this.bridgeServer.requestSnapshot();
      } else {
        this.store.setError(result.message);
        this.addAssistantTurn(result.message);
      }

      this.broadcastState();
      return result;
    }

    const nextSnapshot = applyCommandsToSnapshot(state.snapshot, selectedCommands);
    this.store.upsertSnapshot(nextSnapshot);
    this.store.clearPlan(validation.plan.id);
    this.store.setError(undefined);
    this.addAssistantTurn(
      `Applied ${selectedCommands.length} command(s) in mock mode. Reconnect the Ableton bridge to target the live set.`
    );
    this.broadcastState();

    return {
      planId: validation.plan.id,
      accepted: true,
      message: 'Plan applied in mock mode.',
      executedCommandIndexes: validation.result.executedCommandIndexes
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
    if (this.store.getState().bridgeStatus === 'connected' && this.bridgeServer.isConnected()) {
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

  private broadcastState(): void {
    this.emit('stateChanged', this.store.getState());
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
}

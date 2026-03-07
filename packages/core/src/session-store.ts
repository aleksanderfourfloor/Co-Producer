import type {
  ActionPlan,
  BridgeStatus,
  ChatTurn,
  ContextSnapshot,
  CoproducerState,
  ExecutionTrace,
  ExecutionTraceEntry,
  ReferenceAnalysis,
  AiSettings
} from '@shared/types';
import { defaultAiSettings } from '@shared/settings';

export class SessionStore {
  private state: CoproducerState;

  constructor(initialSnapshot: ContextSnapshot, bridgeStatus: BridgeStatus = 'mock') {
    this.state = {
      bridgeStatus,
      snapshot: initialSnapshot,
      chat: [],
      pendingPlans: [],
      references: [],
      settings: defaultAiSettings
    };
  }

  getState(): CoproducerState {
    return {
      ...this.state,
      settings: { ...this.state.settings },
      snapshot: structuredClone(this.state.snapshot),
      chat: [...this.state.chat],
      pendingPlans: [...this.state.pendingPlans],
      references: [...this.state.references],
      activeExecution: this.state.activeExecution
        ? structuredClone(this.state.activeExecution)
        : undefined,
      lastExecution: this.state.lastExecution ? structuredClone(this.state.lastExecution) : undefined
    };
  }

  setBridgeStatus(status: BridgeStatus, bridgeVersion?: string): CoproducerState {
    this.state = {
      ...this.state,
      bridgeStatus: status,
      bridgeVersion: bridgeVersion ?? this.state.bridgeVersion
    };

    return this.getState();
  }

  upsertSnapshot(snapshot: ContextSnapshot): CoproducerState {
    this.state = {
      ...this.state,
      snapshot
    };

    return this.getState();
  }

  addChatTurn(turn: ChatTurn): CoproducerState {
    this.state = {
      ...this.state,
      chat: [...this.state.chat, turn]
    };

    return this.getState();
  }

  addPlan(plan: ActionPlan): CoproducerState {
    this.state = {
      ...this.state,
      pendingPlans: [plan, ...this.state.pendingPlans.filter((existing) => existing.id !== plan.id)]
    };

    return this.getState();
  }

  clearPlan(planId: string): CoproducerState {
    this.state = {
      ...this.state,
      pendingPlans: this.state.pendingPlans.filter((plan) => plan.id !== planId)
    };

    return this.getState();
  }

  addReference(reference: ReferenceAnalysis): CoproducerState {
    this.state = {
      ...this.state,
      references: [reference, ...this.state.references.filter((entry) => entry.id !== reference.id)]
    };

    return this.getState();
  }

  updateSettings(settings: AiSettings): CoproducerState {
    this.state = {
      ...this.state,
      settings
    };

    return this.getState();
  }

  setError(message?: string): CoproducerState {
    this.state = {
      ...this.state,
      lastError: message
    };

    return this.getState();
  }

  startExecution(trace: ExecutionTrace): CoproducerState {
    this.state = {
      ...this.state,
      activeExecution: trace,
      lastExecution: trace
    };

    return this.getState();
  }

  appendExecutionEntry(entry: ExecutionTraceEntry): CoproducerState {
    if (!this.state.activeExecution || this.state.activeExecution.planId !== entry.planId) {
      return this.getState();
    }

    this.state = {
      ...this.state,
      activeExecution: {
        ...this.state.activeExecution,
        entries: [...this.state.activeExecution.entries, entry]
      },
      lastExecution: {
        ...this.state.activeExecution,
        entries: [...this.state.activeExecution.entries, entry]
      }
    };

    return this.getState();
  }

  finishExecution(
    planId: string,
    patch: Partial<Omit<ExecutionTrace, 'planId' | 'entries'>> & {
      entries?: ExecutionTraceEntry[];
    }
  ): CoproducerState {
    if (!this.state.activeExecution || this.state.activeExecution.planId !== planId) {
      return this.getState();
    }

    const nextTrace: ExecutionTrace = {
      ...this.state.activeExecution,
      ...patch,
      entries: patch.entries ?? this.state.activeExecution.entries
    };

    this.state = {
      ...this.state,
      activeExecution: undefined,
      lastExecution: nextTrace
    };

    return this.getState();
  }
}

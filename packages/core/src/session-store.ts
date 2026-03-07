import type {
  ActionPlan,
  BridgeStatus,
  ChatTurn,
  ContextSnapshot,
  CoproducerState,
  ReferenceAnalysis
} from '@shared/types';

export class SessionStore {
  private state: CoproducerState;

  constructor(initialSnapshot: ContextSnapshot, bridgeStatus: BridgeStatus = 'mock') {
    this.state = {
      bridgeStatus,
      snapshot: initialSnapshot,
      chat: [],
      pendingPlans: [],
      references: []
    };
  }

  getState(): CoproducerState {
    return {
      ...this.state,
      snapshot: structuredClone(this.state.snapshot),
      chat: [...this.state.chat],
      pendingPlans: [...this.state.pendingPlans],
      references: [...this.state.references]
    };
  }

  setBridgeStatus(status: BridgeStatus, bridgeVersion?: string): CoproducerState {
    this.state = {
      ...this.state,
      bridgeStatus: status,
      bridgeVersion
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

  setError(message?: string): CoproducerState {
    this.state = {
      ...this.state,
      lastError: message
    };

    return this.getState();
  }
}

import type {
  ActionPlan,
  AnalysisRequest,
  AnalysisTarget,
  ApplyPlanResult,
  AudioFeatureSummary,
  ContextSnapshot
} from './types';

export interface BridgeHelloMessage {
  type: 'bridge:hello';
  bridgeId: string;
  version: string;
  capabilities: string[];
}

export interface BridgeSnapshotUpdateMessage {
  type: 'snapshot:update';
  snapshot: ContextSnapshot;
}

export interface BridgeAnalysisResultMessage {
  type: 'analysis:result';
  requestId: string;
  target: AnalysisTarget;
  sourceLabel: string;
  features: AudioFeatureSummary;
}

export interface BridgeCommandResultMessage {
  type: 'command:result';
  result: ApplyPlanResult;
}

export interface BridgeErrorMessage {
  type: 'bridge:error';
  message: string;
  code?: string;
  data?: unknown;
}

export type BridgeInboundMessage =
  | BridgeHelloMessage
  | BridgeSnapshotUpdateMessage
  | BridgeAnalysisResultMessage
  | BridgeCommandResultMessage
  | BridgeErrorMessage;

export interface SnapshotRequestMessage {
  type: 'snapshot:request';
}

export interface AnalysisRequestMessage {
  type: 'analysis:request';
  request: AnalysisRequest;
}

export interface CommandBatchMessage {
  type: 'command:batch';
  plan: ActionPlan;
}

export type BridgeOutboundMessage =
  | SnapshotRequestMessage
  | AnalysisRequestMessage
  | CommandBatchMessage;

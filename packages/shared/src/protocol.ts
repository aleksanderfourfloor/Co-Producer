import type {
  ActionPlan,
  AnalysisRequest,
  AnalysisTarget,
  ApplyPlanResult,
  AbletonCommand,
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

export interface BridgeCommandStartedMessage {
  type: 'command:started';
  planId: string;
  source: 'apply' | 'self_test';
  commandCount: number;
  message: string;
}

export interface BridgeCommandStepResultMessage {
  type: 'command:step_result';
  planId: string;
  commandIndex: number;
  commandType: AbletonCommand['type'];
  ok: boolean;
  message: string;
  command?: AbletonCommand;
}

export interface BridgeErrorMessage {
  type: 'bridge:error';
  message: string;
  code?: string;
  planId?: string;
  commandIndex?: number;
  commandType?: AbletonCommand['type'];
  data?: unknown;
}

export type BridgeInboundMessage =
  | BridgeHelloMessage
  | BridgeSnapshotUpdateMessage
  | BridgeAnalysisResultMessage
  | BridgeCommandStartedMessage
  | BridgeCommandStepResultMessage
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

export interface SelfTestRequestMessage {
  type: 'self_test:request';
  planId: string;
}

export type BridgeOutboundMessage =
  | SnapshotRequestMessage
  | AnalysisRequestMessage
  | CommandBatchMessage
  | SelfTestRequestMessage;

import type {
  ActionPlan,
  AiConnectionTestResult,
  AiSettings,
  AnalysisRequest,
  ApplyPlanRequest,
  ApplyPlanResult,
  ChatTurn,
  ContextSnapshot,
  ConversationResponse,
  CoproducerState,
  ReferenceAnalysis
} from '@shared/types';
import { createModelBackedConversationResponse, testAiConnection } from './model-orchestrator';
import { validateApplyPlanRequest } from './plan-guards';
import { createId } from './utils';

export class CoproducerService {
  async createReply(
    message: string,
    snapshot: ContextSnapshot,
    references: ReferenceAnalysis[],
    settings: AiSettings,
    chatHistory: ChatTurn[] = []
  ): Promise<ConversationResponse> {
    return createModelBackedConversationResponse({ message, snapshot, references, chatHistory }, settings);
  }

  createSelectionAnalysisRequest(target: AnalysisRequest['target'], prompt?: string): AnalysisRequest {
    return {
      id: createId('analysis'),
      target,
      prompt
    };
  }

  validateApplyPlan(request: ApplyPlanRequest, state: CoproducerState): {
    result: ApplyPlanResult;
    plan?: ActionPlan;
  } {
    return validateApplyPlanRequest(request, state.snapshot.setRevision, state.pendingPlans);
  }

  async testConnection(settings: AiSettings): Promise<AiConnectionTestResult> {
    return testAiConnection(settings);
  }
}

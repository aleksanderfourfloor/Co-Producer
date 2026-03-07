import type {
  ActionPlan,
  AnalysisRequest,
  ApplyPlanRequest,
  ApplyPlanResult,
  ContextSnapshot,
  ConversationResponse,
  CoproducerState,
  ReferenceAnalysis
} from '@shared/types';
import { createConversationResponse } from './planner';
import { validateApplyPlanRequest } from './plan-guards';
import { createId } from './utils';

export class CoproducerService {
  createReply(
    message: string,
    snapshot: ContextSnapshot,
    references: ReferenceAnalysis[]
  ): ConversationResponse {
    return createConversationResponse({ message, snapshot, references });
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
}

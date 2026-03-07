import type { ActionPlan, ApplyPlanRequest, ApplyPlanResult } from '@shared/types';

export function validateApplyPlanRequest(
  request: ApplyPlanRequest,
  currentRevision: string,
  plans: ActionPlan[]
): { result: ApplyPlanResult; plan?: ActionPlan } {
  const plan = plans.find((candidate) => candidate.id === request.planId);

  if (!plan) {
    return {
      result: {
        planId: request.planId,
        accepted: false,
        message: 'The requested plan no longer exists.',
        executedCommandIndexes: []
      }
    };
  }

  if (request.snapshotRevision !== currentRevision || plan.snapshotRevision !== currentRevision) {
    return {
      result: {
        planId: request.planId,
        accepted: false,
        message: 'The Ableton set changed after the plan was generated. Refresh the snapshot and replan.',
        executedCommandIndexes: []
      }
    };
  }

  const validIndexes = request.selectedCommandIndexes.filter(
    (index) => index >= 0 && index < plan.commands.length
  );

  if (validIndexes.length === 0) {
    return {
      result: {
        planId: request.planId,
        accepted: false,
        message: 'No valid commands were selected.',
        executedCommandIndexes: []
      },
      plan
    };
  }

  return {
    result: {
      planId: request.planId,
      accepted: true,
      message: 'Plan is valid and ready for execution.',
      executedCommandIndexes: validIndexes
    },
    plan
  };
}

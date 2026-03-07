import type { ActionPlan } from '@shared/types';

function describeCommand(command: ActionPlan['commands'][number]): string {
  switch (command.type) {
    case 'create_midi_track':
      return `Create MIDI track "${command.trackName}"`;
    case 'create_audio_track':
      return `Create audio track "${command.trackName}"`;
    case 'name_track':
      return `Rename track to "${command.name}"`;
    case 'set_track_color':
      return `Set track color to ${command.color}`;
    case 'arm_track':
      return command.armed ? 'Arm track for input' : 'Disarm track';
    case 'insert_native_device':
      return `Insert native device ${command.deviceName}`;
    case 'create_midi_clip':
      return `Create MIDI clip "${command.clipName}" (${command.lengthBeats} beats)`;
    case 'replace_clip_notes':
      return `Write ${command.notes.length} MIDI notes`;
    case 'set_device_parameter':
      return `Set ${command.parameterName} to ${Math.round(command.value * 100)}%`;
  }
}

interface PlanPanelProps {
  plans: ActionPlan[];
  selectedCommands: Record<string, number[]>;
  applyingPlanId?: string;
  onToggleCommand: (planId: string, commandIndex: number) => void;
  onApplyPlan: (plan: ActionPlan) => Promise<void>;
}

export function PlanPanel({
  plans,
  selectedCommands,
  applyingPlanId,
  onToggleCommand,
  onApplyPlan
}: PlanPanelProps): JSX.Element {
  return (
    <section className="panel panel-plans">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Action Review</p>
          <h2>Grouped Ableton plans</h2>
        </div>
      </div>

      <div className="plan-list">
        {plans.length === 0 ? (
          <div className="empty-state">
            <p>Action plans appear here after the assistant proposes concrete changes.</p>
          </div>
        ) : null}

        {plans.map((plan) => {
          const selected = selectedCommands[plan.id] ?? plan.commands.map((_, index) => index);

          return (
            <article className="plan-card" key={plan.id}>
              <header>
                <div>
                  <strong>{plan.title}</strong>
                  <p>{plan.summary}</p>
                </div>
                <button
                  className="primary-button"
                  disabled={applyingPlanId === plan.id || selected.length === 0}
                  onClick={() => void onApplyPlan(plan)}
                  type="button"
                >
                  {applyingPlanId === plan.id ? 'Applying...' : `Apply ${selected.length} step(s)`}
                </button>
              </header>
              <p className="plan-rationale">{plan.rationale}</p>
              <div className="command-list">
                {plan.commands.map((command, index) => {
                  const commandId = `${plan.id}-${index}`;
                  const isSelected = selected.includes(index);
                  return (
                    <label className="command-row" htmlFor={commandId} key={commandId}>
                      <input
                        checked={isSelected}
                        id={commandId}
                        onChange={() => onToggleCommand(plan.id, index)}
                        type="checkbox"
                      />
                      <span>{describeCommand(command)}</span>
                    </label>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

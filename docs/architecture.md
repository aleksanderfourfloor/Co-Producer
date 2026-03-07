# Architecture

## Runtime split

- Electron main process owns the session state, bridge server, action safety checks, and IPC surface.
- React renderer owns chat interaction, context display, reference file import, and grouped plan approval.
- The Max for Live bridge owns Live API access and executes validated commands against the open set.

## Data flow

1. The bridge connects to the desktop app over localhost WebSocket and sends a `bridge:hello`.
2. The desktop app requests or receives a `ContextSnapshot`.
3. User messages are turned into arrangement advice and optional `ActionPlan` objects.
4. The user approves all or part of a grouped plan.
5. The desktop app validates the plan revision before dispatching commands.
6. The bridge executes the commands, returns a command result, and publishes a fresh snapshot.

## Safety model

- Every plan records the snapshot revision it was derived from.
- Apply requests carry that revision and selected command indexes.
- If the current set revision differs, the plan is rejected and the assistant prompts the user to replan.
- When the Max bridge is absent, the desktop app falls back to a mock execution engine so the UX can still be exercised.

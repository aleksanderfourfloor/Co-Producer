# Co-Producer Manifesto

## Purpose

Co-Producer should feel like an operator-grade music production copilot inside Ableton Live, not a toy chat window and not a developer demo.

The product must help a producer make better decisions faster, and when possible it must execute those decisions safely inside the DAW.

## Core promises

- It must be useful in under 5 minutes.
- It must make setup obvious instead of hidden.
- It must never pretend a broken connection is working.
- It must never pretend heuristic fallback is equivalent to a real model.
- It must prefer concrete production moves over generic music commentary.
- It must let the user review actions before applying them.

## Setup principles

If the app requires external software, that requirement must be explicit in the docs and in the UI.

That currently means:

- Node.js and npm are required to run the desktop app from source.
- Ollama is required for meaningful local AI chat.
- Ableton Live 12.3+ and Max for Live are required for real DAW control.
- The Max for Live bridge device is required for Live connection.

No hidden prerequisites. No guesswork.

## UX principles

- Chat first.
- Status always visible.
- Setup should be one guided flow.
- The main screen should focus on `connect -> ask -> review -> apply`.
- Complex panels should be hidden unless they are needed.

## AI principles

- If no real model is connected, the app must say so clearly.
- Fallback logic should still produce useful plans, not just descriptive filler.
- Responses must use the actual session context.
- Advice should be actionable, not vague.
- Plans must map cleanly to supported Ableton actions.

## Ableton principles

- One bridge device should be enough to connect.
- Bridge state should be visible: waiting, connected, synced, error.
- Commands should target the selected context first.
- Native Ableton support must be reliable before plugin scope expands.

## Product standard

Co-Producer is not done when it looks plausible.

It is only moving in the right direction when a producer can:

1. open the app
2. understand what is connected and what is not
3. ask for a concrete production move
4. review a short plan
5. apply it in Ableton
6. hear a meaningful result

Anything that does not improve that loop is secondary.

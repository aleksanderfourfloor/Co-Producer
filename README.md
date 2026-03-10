# Co-Producer

Co-Producer is a macOS-first Ableton Live companion app. It gives project-aware music production guidance, proposes grouped Ableton actions, and is in the middle of a bridge migration from an experimental Max for Live write path to a control-surface-based Ableton integration.

## Before you start

Co-Producer is not a standalone web app. To get meaningful value from it, you need all of the following:

- macOS
- Ableton Live 12.3 or newer
- Max for Live
- Node.js 20 or newer
- npm
- Ollama for local AI inference

Without Ollama, the app falls back to a deterministic offline planner. That is useful for basic workflow testing, but not for real model-backed chat quality.

## What must be installed

### 1. Node.js and npm

Verify:

```bash
node -v
npm -v
```

If either command is missing, install Node.js 20 or newer.

### 2. Ollama

On macOS, install Ollama by downloading the app and placing it in `Applications`.

After installation:

1. Open the Ollama app
2. Let it install or link the `ollama` CLI if prompted
3. In Terminal, pull a model:

```bash
ollama pull llama3.1:8b
```

4. Verify Ollama is serving:

```bash
curl http://127.0.0.1:11434/api/tags
```

If that succeeds, Co-Producer can use:

- Provider: `Ollama / local`
- Base URL: `http://127.0.0.1:11434/v1`
- Model: `llama3.1:8b`

### 3. Ableton Live + Max for Live

You need a working Ableton Live 12.3+ install. The current Max bridge remains experimental. The planned authoritative write bridge is the control-surface / remote-script path described in [docs/control-surface-architecture.md](/Users/aleksander/Documents/Development/co-producer/docs/control-surface-architecture.md).

## Project setup

Install dependencies:

```bash
npm install
```

Run the desktop app in development:

```bash
npm run dev
```

Other useful commands:

```bash
npm run test
npm run typecheck
npm run build
```

## First-run quick start

### A. Get the desktop app running

```bash
npm run dev
```

This opens the Electron app.

### B. Connect AI

1. Open the app
2. Open `Setup`
3. Select:
   - Provider: `Ollama / local`
   - Base URL: `http://127.0.0.1:11434/v1`
   - Model: `llama3.1:8b`
4. Click `Save AI settings`
5. Click `Test AI`

If `Test AI` fails:

- make sure Ollama is installed
- make sure the Ollama app is running
- make sure `ollama pull llama3.1:8b` completed
- make sure `curl http://127.0.0.1:11434/api/tags` works

### C. Connect Ableton

1. Keep Co-Producer running
2. Open Ableton Live
3. Create or select a MIDI track
4. If you are testing the experimental Max bridge, drag [Co-Producer Bridge.amxd](/Users/aleksander/Documents/Development/co-producer/bridges/max-for-live/Co-Producer%20Bridge.amxd) onto that MIDI track
5. Wait for the app status to switch from `Mock session` to an Ableton bridge state

Bridge details are documented in [bridges/max-for-live/README.md](/Users/aleksander/Documents/Development/co-producer/bridges/max-for-live/README.md).

## What works today

- chat-first desktop workflow
- selected-track-aware offline planning
- grouped action plans
- revision-safe apply flow
- mock execution when Ableton is not connected
- experimental Max for Live bridge device artifact
- control-surface bridge scaffold
- local-model integration through Ollama's OpenAI-compatible API

## What does not fully work yet

- high-quality music reasoning without a real model connection
- one-click automated Ableton bridge installation
- real audio listening from Live outputs
- arbitrary VST/plugin control
- polished end-to-end production-agent behavior

## How to test something meaningful

### Offline but useful

These prompts should now create actual action plans even without Ollama or Ableton:

- `Write an 8 bar pad idea on the selected track with reverb`
- `Add an 8 bar bass idea with saturation`
- `Add a transition into the drop`
- `Give me arrangement advice`

### With Ollama connected

You should get stronger responses and more flexible plans once Ollama is connected.

### With Ableton connected

Once an authoritative bridge is connected, applying a plan should target the live set instead of the mock session. Today, the Max bridge should be treated as experimental.

## Project layout

- `apps/desktop`: Electron main process, preload bridge, and React renderer
- `packages/shared`: shared domain types, mock data, and bridge protocol
- `packages/core`: planning, orchestration, and session logic
- `bridges/max-for-live`: bridge device, scripts, and Live integration notes
- `docs`: architecture, roadmap, and manifesto

## Docs

- [Architecture](/Users/aleksander/Documents/Development/co-producer/docs/architecture.md)
- [Roadmap](/Users/aleksander/Documents/Development/co-producer/docs/roadmap.md)
- [Manifesto](/Users/aleksander/Documents/Development/co-producer/docs/manifesto.md)

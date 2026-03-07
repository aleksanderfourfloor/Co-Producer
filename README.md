# Co-Producer

Co-Producer is a macOS-first Ableton Live 12.3+ companion app with a Max for Live bridge. It keeps a live snapshot of the current set, gives arrangement/composition guidance, and can apply grouped changes back into Ableton after explicit approval.

## What is in this repo

- An Electron + React + TypeScript desktop app
- Shared session, protocol, and command types
- A co-producer orchestration layer with heuristic planning and analysis
- Max for Live bridge assets and protocol documentation

## Core capabilities in v1

- Whole-set plus current-selection context snapshots
- Text chat with context-aware arrangement/composition guidance
- Grouped action plans for track creation, MIDI generation, and native Ableton device insertion
- Stale-plan protection via snapshot revision matching
- On-demand reference file analysis

## Deferred in v1

- Arbitrary VST insertion and parameter control
- Continuous background listening
- Direct YouTube and SoundCloud ingestion
- Windows support
- Voice-first interaction

## Scripts

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run typecheck`
- `npm run test`

## Project layout

- `apps/desktop`: Electron main process, preload bridge, and React renderer
- `packages/shared`: shared domain types, mock data, and bridge protocol
- `packages/core`: session store, analysis, and planning/orchestration logic
- `bridges/max-for-live`: Max for Live bridge assets and setup notes
- `docs`: architecture notes

## Runtime assumptions

- macOS
- Ableton Live 12.3+
- Max for Live available
- A local bridge connection on `ws://127.0.0.1:49741`

## Notes

The desktop app ships with a mock session fallback so the UI can be explored before wiring it to Ableton. The real Ableton control path is defined by the bridge protocol and the Max for Live scripts in `bridges/max-for-live`.

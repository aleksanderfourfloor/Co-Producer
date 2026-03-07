# Max for Live Bridge

This folder contains the scripts and protocol notes for the Max for Live side of Co-Producer. The desktop app listens on `ws://127.0.0.1:49741` and expects a local bridge client running inside Max for Live.

## Intended patch structure

Use a Max MIDI Effect device as the bridge shell and wire these scripts into it:

- `live.thisdevice`
- `loadbang`
- `node.script bridge-node.mjs`
- `js live-observer.js`
- `route snapshot_request analysis_request command_batch`
- `prepend snapshot`
- `prepend analysis_result`
- `prepend command_result`

The `node.script` instance owns the localhost WebSocket connection to the desktop app. The `js` script uses the Live API to collect context snapshots and execute commands.

## Message flow

- Desktop -> bridge:
  - `snapshot_request`
  - `analysis_request <json>`
  - `command_batch <json>`
- Bridge -> desktop:
  - `snapshot <json>`
  - `analysis_result <json>`
  - `command_result <json>`
  - `bridge_error <json>`

## What is implemented here

- Session snapshot collection from the Live API
- Command execution for track creation, clip creation, note replacement, native device insertion, track naming, track arming, and parameter updates
- A lightweight placeholder analysis response derived from current clip/set density when direct audio capture is not yet wired

## Remaining bridge work

- Package these scripts into a polished `.amxd` device
- Add observers for automatic snapshot invalidation when the set changes
- Replace the placeholder analysis path with real on-demand audio feature extraction from the selected signal path

## Live API references

- Live API overview: https://docs.cycling74.com/userguide/m4l/live_api_overview/
- Song functions: https://docs.cycling74.com/apiref/lom/song/
- Track functions: https://docs.cycling74.com/apiref/lom/track/
- ClipSlot functions: https://docs.cycling74.com/apiref/lom/clipslot/
- Clip note functions: https://docs.cycling74.com/apiref/lom/clip/

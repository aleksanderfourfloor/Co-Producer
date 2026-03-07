# Max for Live Bridge

This folder contains the scripts and protocol notes for the Max for Live side of Co-Producer. The desktop app listens on `ws://127.0.0.1:49741` and expects a local bridge client running inside Max for Live.

## Prerequisites

Before trying to connect the bridge, make sure all of this is already true:

- the desktop app is running via `npm run dev`
- Ableton Live 12.3+ is installed
- Max for Live is available in that Ableton install
- the bridge device file exists at `bridges/max-for-live/Co-Producer Bridge.amxd`
- `bridge-node.mjs` and `live-observer.js` are still in the same folder as the `.amxd`

## Fastest way to connect

Use the packaged bridge device:

- `Co-Producer Bridge.amxd`
- source patch: `Co-Producer Bridge.maxpat`

Keep this `.amxd` file in the same folder as:

- `bridge-node.mjs`
- `live-observer.js`

Then:

1. Start the desktop app with `npm run dev`
2. Open Ableton Live 12.3+
3. Drag `Co-Producer Bridge.amxd` onto any MIDI track
4. Wait for the desktop app to switch from `Mock session` to `Ableton live`

The device connects automatically on load.

If you edit the source patch, regenerate the device with:

- `npm run build:bridge-device`

## What the device contains

- `node.script bridge-node.mjs`
- `js live-observer.js`
- `live.thisdevice`

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

- Harden and validate the generated `.amxd` on more Ableton/Max for Live setups
- Add observers for automatic snapshot invalidation when the set changes
- Replace the placeholder analysis path with real on-demand audio feature extraction from the selected signal path

## If the device does not connect

1. Confirm the desktop app is already running
2. Confirm `Co-Producer Bridge.amxd`, `bridge-node.mjs`, and `live-observer.js` are still in the same folder
3. Open the Max Console inside Ableton and look for bridge errors
4. Check that the desktop app is listening on `ws://127.0.0.1:49741`

## Live API references

- Live API overview: https://docs.cycling74.com/userguide/m4l/live_api_overview/
- Song functions: https://docs.cycling74.com/apiref/lom/song/
- Track functions: https://docs.cycling74.com/apiref/lom/track/
- ClipSlot functions: https://docs.cycling74.com/apiref/lom/clipslot/
- Clip note functions: https://docs.cycling74.com/apiref/lom/clip/

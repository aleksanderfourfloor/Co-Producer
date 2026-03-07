# Control Surface Architecture

## Goal

Replace Max for Live as the primary write bridge with an authoritative Ableton control-surface / remote-script integration.

## Runtime Model

### Desktop app

Owns:
- chat UX
- orchestration
- planning
- approval
- execution traces
- persistence

### Live control-surface bridge

Owns:
- authoritative session mutations
- authoritative snapshot generation
- selected-track / clip / device state
- capability reporting
- deterministic command results

### Optional Max for Live companion

Owns:
- audio taps
- in-set controls
- metering
- diagnostic UI

## Command Model

Every command must include:
- `requestId`
- `planId`
- `commandIndex`
- `commandType`
- payload

Every result must include:
- `requestId`
- `planId`
- `commandIndex`
- `ok`
- `message`
- normalized error code
- post-command snapshot revision

## Supported v1 Commands

- `create_midi_track`
- `create_audio_track`
- `name_track`
- `set_track_color`
- `arm_track`
- `create_midi_clip`
- `replace_clip_notes`
- `insert_native_device`
- `set_device_parameter`

## Verification Rules

- no command returns success until the bridge can re-read the affected object from Live
- no batch returns success if any step is unverified
- the desktop app never invents success from time-based snapshot revisions

## Release Gates

- command passes manual Live QA on each supported version
- bridge self-test passes
- create-track, create-clip, insert-device, and parameter-set flows pass
- all failures include actionable traces

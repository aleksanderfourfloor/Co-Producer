# Control Surface Protocol

## Goals

- deterministic command execution
- authoritative snapshot revisions
- explicit capability reporting
- no false success states

## Hello payload

```json
{
  "type": "bridge:hello",
  "bridgeId": "control-surface",
  "bridgeKind": "control_surface",
  "version": "0.1.0",
  "capabilities": [
    "snapshot",
    "commands",
    "selected_context",
    "transport",
    "native_devices",
    "authoritative_write"
  ],
  "authoritativeWrite": true
}
```

## Required command support for v1

- `create_midi_track`
- `create_audio_track`
- `name_track`
- `set_track_color`
- `arm_track`
- `create_midi_clip`
- `replace_clip_notes`
- `insert_native_device`
- `set_device_parameter`

## Result rules

- every step must return `ok`, `message`, `planId`, `commandIndex`, and `commandType`
- every batch result must include the verified post-command snapshot revision
- if the bridge cannot re-read the affected object, it must report failure

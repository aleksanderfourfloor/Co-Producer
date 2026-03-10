# Control Surface Bridge

This folder is the starting point for the authoritative Ableton write bridge.

Status:
- `preferred` architecture target
- not yet wired into Live
- intended to replace Max for Live as the primary mutation path

## Why this exists

The current Max for Live bridge is useful for experimentation, diagnostics, and future audio taps, but it has not proven reliable enough for deterministic Live mutations across setups.

The control-surface / remote-script path is the new primary direction for:
- authoritative track and clip creation
- native-device insertion
- parameter writes
- selected-context sync
- deterministic execution results

## Planned runtime

1. Ableton loads the `CoProducerRemoteScript` package from the user's Remote Scripts folder.
2. The script opens a local bridge channel to the desktop app.
3. The desktop app sends structured command batches.
4. The script mutates Live through the supported control-surface runtime.
5. The script returns authoritative per-step results and a verified snapshot revision.

## Scaffold contents

- `CoProducerRemoteScript/__init__.py`
- `CoProducerRemoteScript/surface.py`
- `protocol.md`

These files are scaffolds only. They define the initial package shape and bridge contract but do not yet provide a complete Ableton runtime integration.

## Installation target

When the bridge is implemented, the package directory should be copied into Ableton's Remote Scripts location for the supported Live version.

See:
- https://help.ableton.com/hc/en-us/articles/209774285-Using-Control-Surfaces
- https://help.ableton.com/hc/en-us/articles/4416523029138-Using-MIDI-Remote-Scripts

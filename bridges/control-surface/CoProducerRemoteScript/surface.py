"""Scaffold for the authoritative Ableton control-surface bridge.

This file intentionally avoids importing Ableton framework modules so the repo
can carry the package shape before the Live-side implementation is wired.
"""


class CoProducerRemoteScript:
    """Minimal scaffold for the future Remote Script bridge."""

    BRIDGE_ID = "control-surface"
    BRIDGE_KIND = "control_surface"
    VERSION = "0.1.0-scaffold"
    CAPABILITIES = [
        "snapshot",
        "commands",
        "selected_context",
        "transport",
        "native_devices",
        "authoritative_write",
    ]

    def __init__(self, c_instance):
        self.c_instance = c_instance
        self.connected = False

    def disconnect(self):
        self.connected = False

    def capabilities(self):
        return list(self.CAPABILITIES)

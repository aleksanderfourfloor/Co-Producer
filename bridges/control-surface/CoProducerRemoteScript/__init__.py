"""Co-Producer Ableton control-surface bridge scaffold."""

from .surface import CoProducerRemoteScript


def create_instance(c_instance):
    return CoProducerRemoteScript(c_instance)

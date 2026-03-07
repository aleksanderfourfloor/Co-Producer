autowatch = 1;
outlets = 1;

function log(message) {
  post('[Co-Producer Live] ' + message + '\n');
}

function liveApi(path) {
  return new LiveAPI(path);
}

function readProperty(api, property) {
  var value = api.get(property);

  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Array) {
    if (value.length === 2 && value[0] === property) {
      return value[1];
    }

    if (value.length > 1 && value[0] === property) {
      return value.slice(1);
    }
  }

  return value;
}

function parseCanonicalIndex(path, token) {
  var parts = String(path || '').split(' ');
  var position = parts.indexOf(token);
  if (position === -1 || position + 1 >= parts.length) {
    return null;
  }

  return parseInt(parts[position + 1], 10);
}

function rgbToInt(hex) {
  if (!hex) {
    return 0;
  }

  return parseInt(String(hex).replace('#', ''), 16);
}

function encodePayload(value) {
  return encodeURIComponent(JSON.stringify(value));
}

function decodePayload(payload) {
  return JSON.parse(decodeURIComponent(payload));
}

function buildCuePoints(song) {
  var count = song.getcount('cue_points');
  var cuePoints = [];

  for (var index = 0; index < count; index += 1) {
    var cue = liveApi('live_set cue_points ' + index);
    cuePoints.push({
      id: 'cue-' + index,
      name: readProperty(cue, 'name') || 'Marker ' + (index + 1),
      beat: Number(readProperty(cue, 'time') || 0)
    });
  }

  return cuePoints;
}

function buildClipSummary(trackIndex, slotIndex) {
  var slot = liveApi('live_set tracks ' + trackIndex + ' clip_slots ' + slotIndex);
  if (Number(readProperty(slot, 'has_clip')) !== 1) {
    return null;
  }

  var clip = liveApi('live_set tracks ' + trackIndex + ' clip_slots ' + slotIndex + ' clip');
  return {
    id: 'clip-' + trackIndex + '-' + slotIndex,
    name: readProperty(clip, 'name') || 'Clip ' + (slotIndex + 1),
    slotIndex: slotIndex,
    startBeat: Number(readProperty(clip, 'start_time') || 0),
    endBeat: Number(readProperty(clip, 'end_time') || readProperty(clip, 'length') || 0),
    lengthBeats: Number(readProperty(clip, 'length') || readProperty(clip, 'end_marker') || 0),
    isMidi: Number(readProperty(clip, 'is_audio_clip')) !== 1
  };
}

function buildDeviceSummary(trackIndex, deviceIndex) {
  var device = liveApi('live_set tracks ' + trackIndex + ' devices ' + deviceIndex);
  var parameterCount = device.getcount('parameters');
  var parameters = [];

  for (var paramIndex = 0; paramIndex < Math.min(parameterCount, 6); paramIndex += 1) {
    var parameter = liveApi(
      'live_set tracks ' + trackIndex + ' devices ' + deviceIndex + ' parameters ' + paramIndex
    );
    parameters.push({
      id: 'param-' + trackIndex + '-' + deviceIndex + '-' + paramIndex,
      name: readProperty(parameter, 'name') || 'Parameter ' + (paramIndex + 1),
      value: Number(readProperty(parameter, 'value') || 0),
      displayValue: String(readProperty(parameter, 'display_value') || '')
    });
  }

  var className = readProperty(device, 'class_name') || readProperty(device, 'name') || 'Device';
  var type = 'audio_effect';
  if (/operator|wavetable|analog|drum rack|simpler|sampler|drift/i.test(className)) {
    type = 'instrument';
  } else if (/arpeggiator|chord|scale|velocity/i.test(className)) {
    type = 'midi_effect';
  }

  return {
    id: 'device-' + trackIndex + '-' + deviceIndex,
    name: readProperty(device, 'name') || className,
    className: className,
    type: type,
    isNative: true,
    parameters: parameters
  };
}

function buildTrackSummary(trackIndex) {
  var track = liveApi('live_set tracks ' + trackIndex);
  var slotCount = track.getcount('clip_slots');
  var deviceCount = track.getcount('devices');
  var clips = [];
  var devices = [];
  var name = readProperty(track, 'name') || 'Track ' + (trackIndex + 1);

  for (var slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
    var clip = buildClipSummary(trackIndex, slotIndex);
    if (clip) {
      clips.push(clip);
    }
  }

  for (var deviceIndex = 0; deviceIndex < deviceCount; deviceIndex += 1) {
    devices.push(buildDeviceSummary(trackIndex, deviceIndex));
  }

  var role = 'unknown';
  if (/drum|kick|snare|hat/i.test(name)) {
    role = 'drums';
  } else if (/bass|sub/i.test(name)) {
    role = 'bass';
  } else if (/pad|chord|atmo/i.test(name)) {
    role = 'pad';
  } else if (/lead|hook|melody/i.test(name)) {
    role = 'lead';
  }

  var trackType = 'audio';
  if (devices.length > 0 && devices[0].type === 'instrument') {
    trackType = 'midi';
  }

  return {
    id: 'track-' + trackIndex,
    index: trackIndex,
    name: name,
    type: trackType,
    role: role,
    armed: Number(readProperty(track, 'arm') || 0) === 1,
    muted: Number(readProperty(track, 'mute') || 0) === 1,
    solo: Number(readProperty(track, 'solo') || 0) === 1,
    color: '#' + ('000000' + Number(readProperty(track, 'color') || 0).toString(16)).slice(-6),
    volumeDb: Number(readProperty(liveApi('live_set tracks ' + trackIndex + ' mixer_device volume'), 'value') || 0),
    pan: Number(readProperty(liveApi('live_set tracks ' + trackIndex + ' mixer_device panning'), 'value') || 0),
    clips: clips,
    devices: devices
  };
}

function buildSelection() {
  var selectedTrack = liveApi('live_set view selected_track');
  var highlightedSlot = liveApi('live_set view highlighted_clip_slot');
  var trackPath = selectedTrack.unquotedpath || '';
  var slotPath = highlightedSlot.unquotedpath || '';

  return {
    trackId: 'track-' + parseCanonicalIndex(trackPath, 'tracks'),
    trackIndex: parseCanonicalIndex(trackPath, 'tracks'),
    clipId:
      slotPath.indexOf('clip_slots') >= 0
        ? 'clip-' +
          parseCanonicalIndex(slotPath, 'tracks') +
          '-' +
          parseCanonicalIndex(slotPath, 'clip_slots')
        : null,
    clipSlotIndex: parseCanonicalIndex(slotPath, 'clip_slots')
  };
}

function hashString(value) {
  var hash = 5381;
  var index;

  for (index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) >>> 0;
  }

  return ('00000000' + hash.toString(16)).slice(-8);
}

function buildSnapshot() {
  var song = liveApi('live_set');
  var trackCount = song.getcount('tracks');
  var tracks = [];
  var snapshot;

  for (var index = 0; index < trackCount; index += 1) {
    tracks.push(buildTrackSummary(index));
  }

  snapshot = {
    id: 'snapshot-' + new Date().getTime(),
    setRevision: 'pending',
    capturedAt: new Date().toISOString(),
    liveVersion: String(readProperty(song, 'app_version') || '12.3.0'),
    tempo: Number(readProperty(song, 'tempo') || 120),
    timeSignature: [
      Number(readProperty(song, 'signature_numerator') || 4),
      Number(readProperty(song, 'signature_denominator') || 4)
    ],
    transport: {
      isPlaying: Number(readProperty(song, 'is_playing') || 0) === 1,
      arrangementPositionBeats: Number(readProperty(song, 'current_song_time') || 0),
      loopEnabled: Number(readProperty(song, 'loop') || 0) === 1,
      loopStartBeats: Number(readProperty(song, 'loop_start') || 0),
      loopLengthBeats: Number(readProperty(song, 'loop_length') || 0)
    },
    locators: buildCuePoints(song),
    tracks: tracks,
    selection: buildSelection()
  };

  snapshot.setRevision =
    'live-' +
    hashString(
      JSON.stringify({
        liveVersion: snapshot.liveVersion,
        tempo: snapshot.tempo,
        timeSignature: snapshot.timeSignature,
        transport: snapshot.transport,
        locators: snapshot.locators,
        tracks: snapshot.tracks,
        selection: snapshot.selection
      })
    );

  return snapshot;
}

function placeholderAnalysis(request) {
  var snapshot = buildSnapshot();
  var density = 0;
  var deviceCount = 0;
  var selectedTrack = null;

  if (snapshot.selection.trackIndex !== null && snapshot.selection.trackIndex !== undefined) {
    selectedTrack = snapshot.tracks[snapshot.selection.trackIndex];
  }

  for (var index = 0; index < snapshot.tracks.length; index += 1) {
    density += snapshot.tracks[index].clips.length;
    deviceCount += snapshot.tracks[index].devices.length;
  }

  var label = request.target === 'selection' && selectedTrack ? selectedTrack.name : 'Master';

  return {
    requestId: request.id,
    target: request.target,
    sourceLabel: label,
    features: {
      sourceLabel: label,
      durationSeconds: snapshot.transport.loopLengthBeats > 0 ? snapshot.transport.loopLengthBeats : 32,
      peak: Math.min(1, 0.55 + density * 0.03),
      rms: Math.min(1, 0.15 + deviceCount * 0.01),
      crestFactor: 3.6,
      spectralCentroid: 1800 + deviceCount * 60,
      zeroCrossingRate: 0.08 + density * 0.005,
      energyBySegment: [0.18, 0.2, 0.24, 0.31, 0.38, 0.46, 0.41, 0.28],
      tempoEstimate: snapshot.tempo,
      notes: [
        'Placeholder analysis is derived from session density until direct audio capture is added.',
        'Use the desktop-side reference importer for real audio feature extraction today.'
      ]
    }
  };
}

function refreshContext(context) {
  context.snapshot = buildSnapshot();
  return context.snapshot;
}

function normalizeTrackIndex(command, context) {
  var trackIndex =
    command.trackIndex !== null && command.trackIndex !== undefined
      ? command.trackIndex
      : parseTrackIndex(command.trackId);

  if (trackIndex === null || trackIndex === undefined || isNaN(trackIndex)) {
    return null;
  }

  if (context && context.trackIndexMap && context.trackIndexMap[trackIndex] !== undefined) {
    return context.trackIndexMap[trackIndex];
  }

  return trackIndex;
}

function getTrackFromSnapshot(snapshot, command, context) {
  var trackIndex = normalizeTrackIndex(command, context);

  if (trackIndex === null || trackIndex === undefined || isNaN(trackIndex)) {
    return null;
  }

  return snapshot.tracks[trackIndex] || null;
}

function getExpectedTrackIndexForInsert(beforeSnapshot, command) {
  if (command.insertIndex !== undefined && command.insertIndex >= 0) {
    return command.insertIndex;
  }

  return beforeSnapshot.tracks.length;
}

function tracksEquivalent(left, right) {
  if (!left || !right) {
    return false;
  }

  return (
    left.name === right.name &&
    left.type === right.type &&
    left.armed === right.armed &&
    left.muted === right.muted &&
    left.solo === right.solo &&
    String(left.color || '') === String(right.color || '') &&
    left.clips.length === right.clips.length &&
    left.devices.length === right.devices.length
  );
}

function detectInsertedTrackIndex(beforeSnapshot, afterSnapshot) {
  var beforeTracks = beforeSnapshot.tracks;
  var afterTracks = afterSnapshot.tracks;
  var index;
  var offset;
  var matched;

  if (afterTracks.length !== beforeTracks.length + 1) {
    return null;
  }

  for (index = 0; index < afterTracks.length; index += 1) {
    if (index === beforeTracks.length) {
      return index;
    }

    if (tracksEquivalent(beforeTracks[index], afterTracks[index])) {
      continue;
    }

    matched = true;
    for (offset = index; offset < beforeTracks.length; offset += 1) {
      if (!tracksEquivalent(beforeTracks[offset], afterTracks[offset + 1])) {
        matched = false;
        break;
      }
    }

    if (matched) {
      return index;
    }

    return null;
  }

  return beforeTracks.length;
}

function songApi() {
  return liveApi('live_set');
}

function parseTrackIndex(trackId) {
  var parsed = parseInt(String(trackId || '').replace('track-', ''), 10);
  return isNaN(parsed) ? null : parsed;
}

function parseClipSlotIndex(clipId) {
  var parsed = parseInt(String(clipId || '').split('-').slice(-1)[0], 10);
  return isNaN(parsed) ? null : parsed;
}

function parseDeviceIndex(deviceId) {
  var parts = String(deviceId || '').split('-');
  var parsed = parseInt(parts[parts.length - 1], 10);
  return isNaN(parsed) ? null : parsed;
}

function parseParameterRef(parameterId) {
  var parts = String(parameterId || '').split('-');
  if (parts.length < 5) {
    return null;
  }

  var deviceIndex = parseInt(parts[3], 10);
  var parameterIndex = parseInt(parts[4], 10);
  if (isNaN(deviceIndex) || isNaN(parameterIndex)) {
    return null;
  }

  return {
    deviceIndex: deviceIndex,
    parameterIndex: parameterIndex
  };
}

function resolveTrackReference(command, context) {
  var trackIndex = normalizeTrackIndex(command, context);

  if (trackIndex === null || trackIndex === undefined || isNaN(trackIndex)) {
    throw new Error('Track reference is missing.');
  }

  var count = songApi().getcount('tracks');
  if (trackIndex < 0 || trackIndex >= count) {
    throw new Error('Track index is out of range: ' + trackIndex);
  }

  return {
    trackIndex: trackIndex,
    api: liveApi('live_set tracks ' + trackIndex)
  };
}

function resolveClipReference(command, requireExistingClip, context) {
  var trackRef = resolveTrackReference(command, context);
  var slotIndex =
    command.slotIndex !== null && command.slotIndex !== undefined
      ? command.slotIndex
      : parseClipSlotIndex(command.clipId);

  if (slotIndex === null || slotIndex === undefined || isNaN(slotIndex)) {
    throw new Error('Clip reference is missing.');
  }

  var slotApi = liveApi('live_set tracks ' + trackRef.trackIndex + ' clip_slots ' + slotIndex);
  if (requireExistingClip && Number(readProperty(slotApi, 'has_clip')) !== 1) {
    throw new Error('Clip slot ' + slotIndex + ' on track ' + trackRef.trackIndex + ' does not contain a clip.');
  }

  return {
    trackIndex: trackRef.trackIndex,
    slotIndex: slotIndex,
    slotApi: slotApi,
    clipApi: liveApi('live_set tracks ' + trackRef.trackIndex + ' clip_slots ' + slotIndex + ' clip')
  };
}

function resolveParameterReference(command, context) {
  var trackRef = resolveTrackReference(command, context);
  var deviceIndex = parseDeviceIndex(command.deviceId);
  var parameterRef = parseParameterRef(command.parameterId);
  var deviceCount = trackRef.api.getcount('devices');
  var startDevice = deviceIndex !== null ? deviceIndex : 0;
  var endDevice = deviceIndex !== null ? deviceIndex + 1 : deviceCount;

  for (var currentDeviceIndex = startDevice; currentDeviceIndex < endDevice; currentDeviceIndex += 1) {
    var deviceApi = liveApi('live_set tracks ' + trackRef.trackIndex + ' devices ' + currentDeviceIndex);
    var deviceName = readProperty(deviceApi, 'name') || readProperty(deviceApi, 'class_name') || 'Device';
    var parameterCount = deviceApi.getcount('parameters');
    var startParameter = parameterRef ? parameterRef.parameterIndex : 0;
    var endParameter = parameterRef ? parameterRef.parameterIndex + 1 : parameterCount;

    for (var currentParameterIndex = startParameter; currentParameterIndex < endParameter; currentParameterIndex += 1) {
      var parameterApi = liveApi(
        'live_set tracks ' +
          trackRef.trackIndex +
          ' devices ' +
          currentDeviceIndex +
          ' parameters ' +
          currentParameterIndex
      );
      var parameterName = readProperty(parameterApi, 'name') || 'Parameter ' + (currentParameterIndex + 1);
      if (parameterRef || parameterName === command.parameterName) {
        return {
          trackIndex: trackRef.trackIndex,
          deviceIndex: currentDeviceIndex,
          parameterIndex: currentParameterIndex,
          deviceName: deviceName,
          parameterName: parameterName,
          parameterApi: parameterApi
        };
      }
    }
  }

  throw new Error('Device parameter not found: ' + command.parameterName);
}

function replaceClipNotes(clip, notes) {
  clip.call('select_all_notes');
  clip.call('replace_selected_notes');
  clip.call('notes', notes.length);
  for (var index = 0; index < notes.length; index += 1) {
    var note = notes[index];
    clip.call(
      'note',
      note.pitch,
      note.startBeat,
      note.durationBeats,
      note.velocity,
      note.muted ? 1 : 0
    );
  }
  clip.call('done');
}

function createMidiTrackHandler(command, context) {
  var insertIndex = command.insertIndex !== undefined ? command.insertIndex : -1;
  songApi().call('create_midi_track', insertIndex);
  return {
    message: 'Created MIDI track at index ' + (insertIndex >= 0 ? insertIndex : context.snapshot.tracks.length) + '.',
    settleMs: 180,
    verifyRetryCount: 6,
    verifyRetryDelayMs: 120,
    verify: function(beforeSnapshot, afterSnapshot, _command, verifyContext) {
      var requestedIndex = getExpectedTrackIndexForInsert(beforeSnapshot, command);
      var actualIndex = detectInsertedTrackIndex(beforeSnapshot, afterSnapshot);
      if (actualIndex === null) {
        return false;
      }

      verifyContext.trackIndexMap[requestedIndex] = actualIndex;
      verifyContext.lastCreatedTrackIndex = actualIndex;
      return true;
    },
    fallbackExecute: function(beforeSnapshot, _afterSnapshot, _command, verifyContext) {
      if (beforeSnapshot.tracks.length !== verifyContext.snapshot.tracks.length) {
        return false;
      }
      log('Retrying create_midi_track with append mode (-1).');
      songApi().call('create_midi_track', -1);
      return true;
    },
    verifyMessage: 'Ableton did not create the requested MIDI track.'
  };
}

function createAudioTrackHandler(command, context) {
  var insertIndex = command.insertIndex !== undefined ? command.insertIndex : -1;
  songApi().call('create_audio_track', insertIndex);
  return {
    message: 'Created audio track at index ' + (insertIndex >= 0 ? insertIndex : context.snapshot.tracks.length) + '.',
    settleMs: 180,
    verifyRetryCount: 6,
    verifyRetryDelayMs: 120,
    verify: function(beforeSnapshot, afterSnapshot, _command, verifyContext) {
      var requestedIndex = getExpectedTrackIndexForInsert(beforeSnapshot, command);
      var actualIndex = detectInsertedTrackIndex(beforeSnapshot, afterSnapshot);
      if (actualIndex === null) {
        return false;
      }

      verifyContext.trackIndexMap[requestedIndex] = actualIndex;
      verifyContext.lastCreatedTrackIndex = actualIndex;
      return true;
    },
    fallbackExecute: function(beforeSnapshot, _afterSnapshot, _command, verifyContext) {
      if (beforeSnapshot.tracks.length !== verifyContext.snapshot.tracks.length) {
        return false;
      }
      log('Retrying create_audio_track with append mode (-1).');
      songApi().call('create_audio_track', -1);
      return true;
    },
    verifyMessage: 'Ableton did not create the requested audio track.'
  };
}

function nameTrackHandler(command, context) {
  var trackRef = resolveTrackReference(command, context);
  trackRef.api.set('name', command.name);
  return {
    message: 'Renamed track ' + trackRef.trackIndex + ' to "' + command.name + '".',
    settleMs: 120,
    verifyRetryCount: 6,
    verifyRetryDelayMs: 120,
    verify: function(_beforeSnapshot, afterSnapshot, _command, verifyContext) {
      var track = getTrackFromSnapshot(afterSnapshot, command, verifyContext);
      return Boolean(track) && track.name === command.name;
    },
    verifyMessage: 'Ableton did not rename the requested track.'
  };
}

function setTrackColorHandler(command, context) {
  var trackRef = resolveTrackReference(command, context);
  trackRef.api.set('color', rgbToInt(command.color));
  return {
    message: 'Set color on track ' + trackRef.trackIndex + ' to ' + command.color + '.',
    settleMs: 80,
    verifyRetryCount: 4,
    verifyRetryDelayMs: 120,
    verify: function(_beforeSnapshot, afterSnapshot, _command, verifyContext) {
      var track = getTrackFromSnapshot(afterSnapshot, command, verifyContext);
      return Boolean(track) && String(track.color).toLowerCase() === String(command.color).toLowerCase();
    },
    verifyMessage: 'Ableton did not update the track color.'
  };
}

function armTrackHandler(command, context) {
  var trackRef = resolveTrackReference(command, context);
  trackRef.api.set('arm', command.armed ? 1 : 0);
  return {
    message: (command.armed ? 'Armed' : 'Disarmed') + ' track ' + trackRef.trackIndex + '.',
    settleMs: 80,
    verifyRetryCount: 4,
    verifyRetryDelayMs: 120,
    verify: function(_beforeSnapshot, afterSnapshot, _command, verifyContext) {
      var track = getTrackFromSnapshot(afterSnapshot, command, verifyContext);
      return Boolean(track) && track.armed === command.armed;
    },
    verifyMessage: 'Ableton did not update the track arm state.'
  };
}

function insertNativeDeviceHandler(command, context) {
  var trackRef = resolveTrackReference(command, context);
  if (command.insertIndex !== undefined) {
    trackRef.api.call('insert_device', command.deviceName, command.insertIndex);
  } else {
    trackRef.api.call('insert_device', command.deviceName);
  }
  return {
    message:
      'Inserted device "' +
      command.deviceName +
      '" on track ' +
      trackRef.trackIndex +
      (command.insertIndex !== undefined ? ' at device slot ' + command.insertIndex : '') +
      '.',
    settleMs: 180,
    verifyRetryCount: 6,
    verifyRetryDelayMs: 120,
    verify: function(beforeSnapshot, afterSnapshot, _command, verifyContext) {
      var beforeTrack = getTrackFromSnapshot(beforeSnapshot, command, verifyContext);
      var afterTrack = getTrackFromSnapshot(afterSnapshot, command, verifyContext);
      var expectedDevice = command.insertIndex !== undefined ? afterTrack && afterTrack.devices[command.insertIndex] : null;
      return Boolean(afterTrack) &&
        afterTrack.devices.length >= ((beforeTrack && beforeTrack.devices.length) || 0) + 1 &&
        (expectedDevice ? expectedDevice.name === command.deviceName : afterTrack.devices.some(function(device) {
          return device.name === command.deviceName;
        }));
    },
    verifyMessage: 'Ableton did not insert the requested device.'
  };
}

function createMidiClipHandler(command, context) {
  var clipRef = resolveClipReference(command, false, context);
  clipRef.slotApi.call('create_clip', command.lengthBeats);
  return {
    message:
      'Created MIDI clip "' +
      command.clipName +
      '" on track ' +
      clipRef.trackIndex +
      ', slot ' +
      clipRef.slotIndex +
      '.',
    settleMs: 180,
    verifyRetryCount: 6,
    verifyRetryDelayMs: 120,
    afterVerify: function() {
      var verifiedClipRef = resolveClipReference(command, true, context);
      verifiedClipRef.clipApi.set('name', command.clipName);
    },
    verify: function(_beforeSnapshot, afterSnapshot, _command, verifyContext) {
      var track = getTrackFromSnapshot(afterSnapshot, command, verifyContext);
      if (!track) {
        return false;
      }

      return track.clips.some(function(clip) {
        return clip.slotIndex === command.slotIndex;
      });
    },
    verifyMessage: 'Ableton did not create the requested MIDI clip.'
  };
}

function replaceClipNotesHandler(command, context) {
  var clipRef = resolveClipReference(command, true, context);
  replaceClipNotes(clipRef.clipApi, command.notes);
  return {
    message:
      'Replaced notes in clip slot ' +
      clipRef.slotIndex +
      ' on track ' +
      clipRef.trackIndex +
      ' with ' +
      command.notes.length +
      ' notes.',
    settleMs: 120,
    verifyRetryCount: 5,
    verifyRetryDelayMs: 120,
    verify: function(_beforeSnapshot, afterSnapshot, _command, verifyContext) {
      var track = getTrackFromSnapshot(afterSnapshot, command, verifyContext);
      if (!track) {
        return false;
      }

      return track.clips.some(function(clip) {
        return clip.slotIndex === command.slotIndex;
      });
    },
    verifyMessage: 'Ableton did not confirm the target clip after replacing notes.'
  };
}

function setDeviceParameterHandler(command, context) {
  var parameterRef = resolveParameterReference(command, context);
  parameterRef.parameterApi.set('value', command.value);
  return {
    message:
      'Set parameter "' +
      parameterRef.parameterName +
      '" on "' +
      parameterRef.deviceName +
      '" (track ' +
      parameterRef.trackIndex +
      ', device ' +
      parameterRef.deviceIndex +
      ') to ' +
      command.value +
      '.',
    settleMs: 100,
    verifyRetryCount: 5,
    verifyRetryDelayMs: 120,
    verify: function(_beforeSnapshot, afterSnapshot, _command, verifyContext) {
      var track = getTrackFromSnapshot(afterSnapshot, command, verifyContext);
      var matched;
      if (!track) {
        return false;
      }

      track.devices.some(function(device) {
        return device.parameters.some(function(parameter) {
          if (parameter.name !== command.parameterName) {
            return false;
          }

          matched = parameter;
          return true;
        });
      });

      return Boolean(matched) && Math.abs(Number(matched.value) - Number(command.value)) < 0.001;
    },
    verifyMessage: 'Ableton did not update the requested device parameter.'
  };
}

var commandHandlers = {
  create_midi_track: createMidiTrackHandler,
  create_audio_track: createAudioTrackHandler,
  name_track: nameTrackHandler,
  set_track_color: setTrackColorHandler,
  arm_track: armTrackHandler,
  insert_native_device: insertNativeDeviceHandler,
  create_midi_clip: createMidiClipHandler,
  replace_clip_notes: replaceClipNotesHandler,
  set_device_parameter: setDeviceParameterHandler
};

function emitCommandStarted(planId, source, commandCount, message) {
  outlet(
    0,
    'command_started',
    encodePayload({
      planId: planId,
      source: source,
      commandCount: commandCount,
      message: message
    })
  );
}

function emitStepResult(planId, commandIndex, command, ok, message) {
  outlet(
    0,
    'command_step_result',
    encodePayload({
      planId: planId,
      commandIndex: commandIndex,
      commandType: command.type,
      ok: ok,
      message: message,
      command: command
    })
  );
}

function emitCommandResult(planId, accepted, message, executedIndexes, failedCommandIndex, failedCommandType) {
  outlet(
    0,
    'command_result',
    encodePayload({
      planId: planId,
      accepted: accepted,
      message: message,
      executedCommandIndexes: executedIndexes,
      failedCommandIndex: failedCommandIndex,
      failedCommandType: failedCommandType
    })
  );
}

function emitBridgeError(message, planId, commandIndex, commandType, code, data) {
  outlet(
    0,
    'bridge_error',
    encodePayload({
      message: message,
      planId: planId,
      commandIndex: commandIndex,
      commandType: commandType,
      code: code,
      data: data
    })
  );
}

function executeCommandStep(command, context) {
  var handler = commandHandlers[command.type];
  if (!handler) {
    throw new Error('Unsupported command type: ' + command.type);
  }

  return handler(command, context);
}

var activeExecutionTask = null;

function cancelActiveExecutionTask() {
  if (!activeExecutionTask) {
    return;
  }

  try {
    activeExecutionTask.cancel();
  } catch (_error) {
    // Ignore.
  }
  activeExecutionTask = null;
}

function failPlan(context, command, errorMessage) {
  log('Failed command ' + context.index + ': ' + command.type + ' -> ' + errorMessage + '.');
  emitStepResult(context.plan.id, context.index, command, false, errorMessage);
  emitCommandResult(context.plan.id, false, errorMessage, context.executed, context.index, command.type);
  emitBridgeError(errorMessage, context.plan.id, context.index, command.type, 'command_step_failed', {
    command: command
  });
  cancelActiveExecutionTask();
}

function completePlan(context) {
  emitCommandResult(
    context.plan.id,
    true,
    'Executed ' + context.executed.length + ' command(s) in Ableton Live.',
    context.executed
  );
  snapshot_request();
  cancelActiveExecutionTask();
}

function continuePlan(context) {
  var command;
  var beforeSnapshot;
  var task;
  var attempts = 0;
  var step;
  var executedCommand = false;
  var fallbackAttempted = false;

  if (context.index >= context.plan.commands.length) {
    completePlan(context);
    return;
  }

  command = context.plan.commands[context.index];
  beforeSnapshot = context.snapshot;

  task = new Task(function() {
    var errorMessage;
    try {
      if (!executedCommand) {
        log('Starting command ' + context.index + ': ' + command.type + '.');
        step = executeCommandStep(command, context) || {};
        executedCommand = true;
        activeExecutionTask = task;
        task.schedule(step.settleMs || 80);
        return;
      }

      refreshContext(context);
      if (step.verify && !step.verify(beforeSnapshot, context.snapshot, command, context)) {
        attempts += 1;
        if (attempts < (step.verifyRetryCount || 1)) {
          log(
            'Verification retry ' +
              attempts +
              ' for command ' +
              context.index +
              ': ' +
              command.type +
              '.'
          );
          activeExecutionTask = task;
          task.schedule(step.verifyRetryDelayMs || 120);
          return;
        }
        if (step.fallbackExecute && !fallbackAttempted) {
          fallbackAttempted = true;
          attempts = 0;
          if (step.fallbackExecute(beforeSnapshot, context.snapshot, command, context)) {
            activeExecutionTask = task;
            task.schedule(step.verifyRetryDelayMs || 120);
            return;
          }
        }
        throw new Error(step.verifyMessage || 'Ableton did not reflect the requested mutation.');
      }
      if (step.afterVerify) {
        step.afterVerify(beforeSnapshot, context.snapshot, command, context);
        refreshContext(context);
      }
      context.executed.push(context.index);
      log('Succeeded command ' + context.index + ': ' + command.type + '.');
      emitStepResult(context.plan.id, context.index, command, true, step.message || 'Command completed.');
      context.index += 1;
      activeExecutionTask = null;
      continuePlan(context);
    } catch (error) {
      errorMessage = error && error.message ? error.message : String(error);
      failPlan(context, command, errorMessage);
    }
  }, this);

  activeExecutionTask = task;
  task.schedule(0);
}

function executePlan(plan, source) {
  var context = {
    snapshot: buildSnapshot(),
    plan: plan,
    source: source,
    executed: [],
    index: 0,
    trackIndexMap: {}
  };

  cancelActiveExecutionTask();
  log('Running ' + source + ' batch ' + plan.id + ' with ' + plan.commands.length + ' command(s).');
  emitCommandStarted(
    plan.id,
    source,
    plan.commands.length,
    'Bridge received ' + plan.commands.length + ' command(s) for execution.'
  );
  continuePlan(context);
}

function buildSelfTestPlan(planId) {
  var snapshot = buildSnapshot();
  var insertIndex = -1;
  var requestedTrackIndex = snapshot.tracks.length;

  return {
    id: planId,
    title: 'Ableton bridge self-test',
    summary: 'Create a temporary MIDI track and clip to verify Live mutations.',
    rationale: 'This self-test confirms the Max bridge can mutate the Live set and report telemetry back to the desktop app.',
    createdAt: new Date().toISOString(),
    snapshotRevision: snapshot.setRevision,
    commands: [
      {
        type: 'create_midi_track',
        trackName: 'Co-Producer Self Test',
        insertIndex: insertIndex
      },
      {
        type: 'name_track',
        trackIndex: requestedTrackIndex,
        name: 'Co-Producer Self Test'
      },
      {
        type: 'create_midi_clip',
        trackIndex: requestedTrackIndex,
        clipName: 'Self Test Clip',
        slotIndex: 0,
        startBeat: 0,
        lengthBeats: 4
      }
    ]
  };
}

function loadbang() {
  log('Bridge ready.');
}

function snapshot_request() {
  log('Building Live snapshot for desktop request.');
  outlet(0, 'snapshot', encodePayload(buildSnapshot()));
}

function analysis_request(payload) {
  var request = decodePayload(payload);
  log('Running placeholder analysis for ' + request.target + '.');
  outlet(0, 'analysis_result', encodePayload(placeholderAnalysis(request)));
}

function command_batch(payload) {
  var plan = decodePayload(payload);
  log('Received command batch ' + plan.id + '.');
  executePlan(plan, 'apply');
}

function self_test_request(planId) {
  log('Running bridge self-test ' + planId + '.');
  snapshot_request();
  executePlan(buildSelfTestPlan(planId), 'self_test');
}

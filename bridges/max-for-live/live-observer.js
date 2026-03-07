autowatch = 1;
outlets = 1;

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
  var parts = String(path).split(' ');
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

function buildSnapshot() {
  var song = liveApi('live_set');
  var trackCount = song.getcount('tracks');
  var tracks = [];

  for (var index = 0; index < trackCount; index += 1) {
    tracks.push(buildTrackSummary(index));
  }

  return {
    id: 'snapshot-' + new Date().getTime(),
    setRevision: 'live-' + new Date().getTime(),
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

function ensureTrack(command) {
  var trackIndex =
    command.trackIndex !== null && command.trackIndex !== undefined
      ? command.trackIndex
      : parseInt(String(command.trackId || '').replace('track-', ''), 10);

  if (isNaN(trackIndex)) {
    throw new Error('Track reference is missing.');
  }

  return liveApi('live_set tracks ' + trackIndex);
}

function ensureClip(command) {
  var trackIndex =
    command.trackIndex !== null && command.trackIndex !== undefined
      ? command.trackIndex
      : parseInt(String(command.trackId || '').replace('track-', ''), 10);
  var slotIndex =
    command.slotIndex !== null && command.slotIndex !== undefined
      ? command.slotIndex
      : parseInt(String(command.clipId || '').split('-').slice(-1)[0], 10);

  if (isNaN(trackIndex) || isNaN(slotIndex)) {
    throw new Error('Clip reference is missing.');
  }

  return liveApi('live_set tracks ' + trackIndex + ' clip_slots ' + slotIndex + ' clip');
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

function setTrackName(trackApi, name) {
  trackApi.set('name', name);
}

function setTrackColor(trackApi, color) {
  trackApi.set('color', rgbToInt(color));
}

function setTrackArm(trackApi, armed) {
  trackApi.set('arm', armed ? 1 : 0);
}

function executeCommand(command) {
  var song = liveApi('live_set');

  switch (command.type) {
    case 'create_midi_track':
      song.call('create_midi_track', command.insertIndex !== undefined ? command.insertIndex : -1);
      break;
    case 'create_audio_track':
      song.call('create_audio_track', command.insertIndex !== undefined ? command.insertIndex : -1);
      break;
    case 'name_track':
      setTrackName(ensureTrack(command), command.name);
      break;
    case 'set_track_color':
      setTrackColor(ensureTrack(command), command.color);
      break;
    case 'arm_track':
      setTrackArm(ensureTrack(command), command.armed);
      break;
    case 'insert_native_device': {
      var track = ensureTrack(command);
      if (command.insertIndex !== undefined) {
        track.call('insert_device', command.deviceName, command.insertIndex);
      } else {
        track.call('insert_device', command.deviceName);
      }
      break;
    }
    case 'create_midi_clip': {
      var slot = liveApi(
        'live_set tracks ' + command.trackIndex + ' clip_slots ' + command.slotIndex
      );
      slot.call('create_clip', command.lengthBeats);
      var clip = ensureClip(command);
      clip.set('name', command.clipName);
      break;
    }
    case 'replace_clip_notes':
      replaceClipNotes(ensureClip(command), command.notes);
      break;
    case 'set_device_parameter': {
      var trackForParameter = ensureTrack(command);
      var deviceCount = trackForParameter.getcount('devices');
      var matched = false;

      for (var deviceIndex = 0; deviceIndex < deviceCount && !matched; deviceIndex += 1) {
        var device = liveApi('live_set tracks ' + trackForParameter.unquotedpath.split(' ').slice(-1)[0] + ' devices ' + deviceIndex);
        var parameterCount = device.getcount('parameters');
        for (var parameterIndex = 0; parameterIndex < parameterCount; parameterIndex += 1) {
          var parameter = liveApi(
            'live_set tracks ' +
              trackForParameter.unquotedpath.split(' ').slice(-1)[0] +
              ' devices ' +
              deviceIndex +
              ' parameters ' +
              parameterIndex
          );
          if (readProperty(parameter, 'name') === command.parameterName) {
            parameter.set('value', command.value);
            matched = true;
            break;
          }
        }
      }

      if (!matched) {
        throw new Error('Device parameter not found: ' + command.parameterName);
      }
      break;
    }
  }
}

function loadbang() {
  post('Co-Producer Live bridge ready.\n');
}

function snapshot_request() {
  outlet(0, 'snapshot', JSON.stringify(buildSnapshot()));
}

function analysis_request(payload) {
  var request = JSON.parse(payload);
  outlet(0, 'analysis_result', JSON.stringify(placeholderAnalysis(request)));
}

function command_batch(payload) {
  var plan = JSON.parse(payload);
  var executed = [];

  try {
    for (var index = 0; index < plan.commands.length; index += 1) {
      executeCommand(plan.commands[index]);
      executed.push(index);
    }

    outlet(
      0,
      'command_result',
      JSON.stringify({
        planId: plan.id,
        accepted: true,
        message: 'Executed ' + executed.length + ' command(s) in Ableton Live.',
        executedCommandIndexes: executed
      })
    );
    snapshot_request();
  } catch (error) {
    outlet(
      0,
      'command_result',
      JSON.stringify({
        planId: plan.id,
        accepted: false,
        message: error.message,
        executedCommandIndexes: executed
      })
    );
    outlet(
      0,
      'bridge_error',
      JSON.stringify({
        message: error.message
      })
    );
  }
}

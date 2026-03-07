export type MusicalRole =
  | 'drums'
  | 'bass'
  | 'lead'
  | 'pad'
  | 'fx'
  | 'vocal'
  | 'utility'
  | 'unknown';

export type TrackType = 'midi' | 'audio' | 'return' | 'master';
export type DeviceType = 'instrument' | 'audio_effect' | 'midi_effect' | 'unknown';
export type AnalysisTarget = 'selection' | 'track' | 'master' | 'reference_file';
export type BridgeStatus = 'waiting' | 'syncing' | 'connected' | 'executing' | 'error' | 'mock';
export type AiProvider = 'heuristic' | 'ollama' | 'openai_compatible';

export interface MidiNote {
  pitch: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
  muted?: boolean;
  probability?: number;
}

export interface ClipSummary {
  id: string;
  name: string;
  slotIndex: number;
  startBeat: number;
  endBeat: number;
  lengthBeats: number;
  isMidi: boolean;
  noteCount?: number;
  notes?: MidiNote[];
  color?: string;
}

export interface DeviceParameterSummary {
  id: string;
  name: string;
  value: number;
  displayValue?: string;
  unit?: string;
}

export interface DeviceSummary {
  id: string;
  name: string;
  className: string;
  type: DeviceType;
  isNative: boolean;
  parameters: DeviceParameterSummary[];
}

export interface TrackSummary {
  id: string;
  index: number;
  name: string;
  type: TrackType;
  role: MusicalRole;
  armed: boolean;
  muted: boolean;
  solo: boolean;
  color?: string;
  volumeDb?: number;
  pan?: number;
  clips: ClipSummary[];
  devices: DeviceSummary[];
}

export interface Locator {
  id: string;
  name: string;
  beat: number;
}

export interface CurrentSelection {
  trackId?: string;
  trackIndex?: number;
  clipId?: string;
  clipSlotIndex?: number;
  sceneIndex?: number;
  deviceId?: string;
}

export interface AudioFeatureSummary {
  sourceLabel: string;
  durationSeconds: number;
  peak: number;
  rms: number;
  crestFactor: number;
  spectralCentroid: number;
  zeroCrossingRate: number;
  energyBySegment: number[];
  tempoEstimate?: number;
  notes?: string[];
}

export interface ContextSnapshot {
  id: string;
  setRevision: string;
  capturedAt: string;
  liveVersion: string;
  tempo: number;
  timeSignature: [number, number];
  transport: {
    isPlaying: boolean;
    arrangementPositionBeats: number;
    loopEnabled: boolean;
    loopStartBeats: number;
    loopLengthBeats: number;
  };
  locators: Locator[];
  tracks: TrackSummary[];
  selection: CurrentSelection;
  analysis?: {
    selection?: AudioFeatureSummary;
    master?: AudioFeatureSummary;
  };
}

export interface AnalysisRequest {
  id: string;
  target: AnalysisTarget;
  prompt?: string;
  comparisonReferenceId?: string;
  trackId?: string;
  clipId?: string;
  fileName?: string;
  sourceLabel?: string;
}

export interface ReferenceAnalysis {
  id: string;
  fileName: string;
  importedAt: string;
  features: AudioFeatureSummary;
}

export interface CreateMidiTrackCommand {
  type: 'create_midi_track';
  trackName: string;
  insertIndex?: number;
}

export interface CreateAudioTrackCommand {
  type: 'create_audio_track';
  trackName: string;
  insertIndex?: number;
}

export interface CreateMidiClipCommand {
  type: 'create_midi_clip';
  trackId?: string;
  trackIndex?: number;
  clipName: string;
  slotIndex: number;
  startBeat: number;
  lengthBeats: number;
}

export interface ReplaceClipNotesCommand {
  type: 'replace_clip_notes';
  clipId?: string;
  trackId?: string;
  trackIndex?: number;
  slotIndex?: number;
  notes: MidiNote[];
}

export interface InsertNativeDeviceCommand {
  type: 'insert_native_device';
  trackId?: string;
  trackIndex?: number;
  deviceName: string;
  deviceCategory: DeviceType;
  insertIndex?: number;
}

export interface SetDeviceParameterCommand {
  type: 'set_device_parameter';
  trackId?: string;
  trackIndex?: number;
  deviceId?: string;
  parameterId?: string;
  parameterName: string;
  value: number;
}

export interface NameTrackCommand {
  type: 'name_track';
  trackId?: string;
  trackIndex?: number;
  name: string;
}

export interface SetTrackColorCommand {
  type: 'set_track_color';
  trackId?: string;
  trackIndex?: number;
  color: string;
}

export interface ArmTrackCommand {
  type: 'arm_track';
  trackId?: string;
  trackIndex?: number;
  armed: boolean;
}

export type AbletonCommand =
  | CreateMidiTrackCommand
  | CreateAudioTrackCommand
  | CreateMidiClipCommand
  | ReplaceClipNotesCommand
  | InsertNativeDeviceCommand
  | SetDeviceParameterCommand
  | NameTrackCommand
  | SetTrackColorCommand
  | ArmTrackCommand;

export interface ActionPlan {
  id: string;
  title: string;
  summary: string;
  rationale: string;
  createdAt: string;
  snapshotRevision: string;
  commands: AbletonCommand[];
}

export interface ApplyPlanRequest {
  planId: string;
  snapshotRevision: string;
  selectedCommandIndexes: number[];
}

export interface ApplyPlanResult {
  planId: string;
  accepted: boolean;
  message: string;
  executedCommandIndexes: number[];
  failedCommandIndex?: number;
  failedCommandType?: AbletonCommand['type'];
  snapshotConfirmed?: boolean;
  suspect?: boolean;
}

export interface ExecutionTraceEntry {
  id: string;
  planId: string;
  timestamp: string;
  kind: 'batch' | 'step' | 'result' | 'snapshot' | 'error';
  level: 'info' | 'success' | 'error' | 'warning';
  message: string;
  commandIndex?: number;
  commandType?: AbletonCommand['type'];
  ok?: boolean;
  commandPayload?: AbletonCommand;
  code?: string;
}

export interface ExecutionTrace {
  planId: string;
  mode: 'bridge' | 'mock' | 'self_test';
  status: 'running' | 'succeeded' | 'failed' | 'suspect';
  startedAt: string;
  finishedAt?: string;
  summary?: string;
  snapshotRevisionBefore?: string;
  snapshotRevisionAfter?: string;
  entries: ExecutionTraceEntry[];
}

export interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  relatedPlanId?: string;
}

export interface CoproducerState {
  bridgeStatus: BridgeStatus;
  bridgeVersion?: string;
  snapshot: ContextSnapshot;
  chat: ChatTurn[];
  pendingPlans: ActionPlan[];
  references: ReferenceAnalysis[];
  settings: AiSettings;
  lastError?: string;
  activeExecution?: ExecutionTrace;
  lastExecution?: ExecutionTrace;
}

export interface ConversationResponse {
  reply: string;
  plan?: ActionPlan;
  source: 'heuristic' | 'model';
  warning?: string;
}

export interface ConversationRequest {
  message: string;
  snapshot: ContextSnapshot;
  references: ReferenceAnalysis[];
  chatHistory?: ChatTurn[];
}

export interface AiSettings {
  provider: AiProvider;
  model: string;
  baseUrl: string;
  apiKey?: string;
  systemPrompt?: string;
  temperature: number;
}

export interface AiConnectionTestResult {
  ok: boolean;
  message: string;
  provider: AiProvider;
}

export interface BridgeInstallInfo {
  bridgeDevicePath: string;
  bridgeFolderPath: string;
}

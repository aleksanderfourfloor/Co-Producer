import { contextBridge, ipcRenderer } from 'electron';
import type {
  AnalysisTarget,
  ApplyPlanRequest,
  ApplyPlanResult,
  CoproducerState,
  ReferenceAnalysis
} from '@shared/types';

export interface CoproducerDesktopApi {
  getState: () => Promise<CoproducerState>;
  sendMessage: (message: string) => Promise<CoproducerState>;
  applyPlan: (request: ApplyPlanRequest) => Promise<ApplyPlanResult>;
  saveReference: (reference: ReferenceAnalysis) => Promise<CoproducerState>;
  requestAnalysis: (target: AnalysisTarget, prompt?: string) => Promise<CoproducerState>;
  onStateChanged: (listener: (state: CoproducerState) => void) => () => void;
}

const api: CoproducerDesktopApi = {
  getState: () => ipcRenderer.invoke('coproducer:get-state'),
  sendMessage: (message) => ipcRenderer.invoke('coproducer:send-message', message),
  applyPlan: (request) => ipcRenderer.invoke('coproducer:apply-plan', request),
  saveReference: (reference) => ipcRenderer.invoke('coproducer:save-reference', reference),
  requestAnalysis: (target, prompt) => ipcRenderer.invoke('coproducer:request-analysis', target, prompt),
  onStateChanged: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, state: CoproducerState) => {
      listener(state);
    };

    ipcRenderer.on('coproducer:state-changed', wrapped);
    return () => {
      ipcRenderer.removeListener('coproducer:state-changed', wrapped);
    };
  }
};

contextBridge.exposeInMainWorld('coproducer', api);

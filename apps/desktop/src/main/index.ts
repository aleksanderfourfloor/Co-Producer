import { join } from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import type {
  AiSettings,
  AnalysisTarget,
  ApplyPlanRequest,
  BridgeInstallInfo,
  ReferenceAnalysis
} from '@shared/types';
import { DesktopController } from './controller';
import { SettingsStore } from './settings-store';

let controller: DesktopController;
let mainWindow: BrowserWindow | undefined;
let settingsStore: SettingsStore | undefined;

function pushStateToRenderer(): void {
  if (!mainWindow) {
    return;
  }

  mainWindow.webContents.send('coproducer:state-changed', controller.getState());
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1540,
    height: 980,
    minWidth: 1240,
    minHeight: 820,
    backgroundColor: '#121515',
    title: 'Co-Producer',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false
    }
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = undefined;
  });
}

app.whenReady().then(() => {
  settingsStore = new SettingsStore(join(app.getPath('userData'), 'co-producer-settings.json'));
  settingsStore.load().then((settings) => {
    controller = new DesktopController(settings);
    controller.start();
    controller.on('stateChanged', pushStateToRenderer);
    createMainWindow();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  controller.stop();
});

ipcMain.handle('coproducer:get-state', async () => controller.getState());
ipcMain.handle('coproducer:send-message', async (_event, message: string) => {
  return controller.sendMessage(message);
});
ipcMain.handle('coproducer:apply-plan', async (_event, request: ApplyPlanRequest) => {
  return controller.applyPlan(request);
});
ipcMain.handle('coproducer:run-bridge-self-test', async () => {
  return controller.runBridgeSelfTest();
});
ipcMain.handle('coproducer:save-reference', async (_event, reference: ReferenceAnalysis) => {
  return controller.saveReference(reference);
});
ipcMain.handle(
  'coproducer:request-analysis',
  async (_event, target: AnalysisTarget, prompt?: string) => {
    return controller.requestAnalysis(target, prompt);
  }
);
ipcMain.handle('coproducer:update-settings', async (_event, settings: AiSettings) => {
  await settingsStore?.save(settings);
  return controller.updateSettings(settings);
});
ipcMain.handle('coproducer:test-model-connection', async () => {
  return controller.testModelConnection();
});
ipcMain.handle('coproducer:get-bridge-install-info', async (): Promise<BridgeInstallInfo> => {
  const rootPath = process.cwd();
  return {
    bridgeFolderPath: join(rootPath, 'bridges', 'max-for-live'),
    bridgeDevicePath: join(rootPath, 'bridges', 'max-for-live', 'Co-Producer Bridge.amxd')
  };
});

import { join } from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import type { AnalysisTarget, ApplyPlanRequest, ReferenceAnalysis } from '@shared/types';
import { DesktopController } from './controller';

const controller = new DesktopController();
let mainWindow: BrowserWindow | undefined;

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
  controller.start();
  controller.on('stateChanged', pushStateToRenderer);
  createMainWindow();

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
ipcMain.handle('coproducer:save-reference', async (_event, reference: ReferenceAnalysis) => {
  return controller.saveReference(reference);
});
ipcMain.handle(
  'coproducer:request-analysis',
  async (_event, target: AnalysisTarget, prompt?: string) => {
    return controller.requestAnalysis(target, prompt);
  }
);

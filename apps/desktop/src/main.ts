import path from 'path';
import fs from 'fs';
import { app, BrowserWindow, dialog, ipcMain, Notification, screen, shell } from 'electron';
import { initAutoUpdater } from './updater';

// Log file for main-process output — written before any async work so the
// path is available in the error dialog if boot fails.
const logDir = app.getPath('userData');
const logPath = path.join(logDir, 'main.log');

function writeLog(level: 'INFO' | 'ERROR', message: string, detail?: unknown): void {
  const line = `[${new Date().toISOString()}] [${level}] ${message}${detail !== undefined ? ' ' + (detail instanceof Error ? detail.stack : String(detail)) : ''}\n`;
  try {
    fs.appendFileSync(logPath, line, 'utf8');
  } catch {
    // Nowhere to log if the log file itself fails.
  }
  if (level === 'ERROR') {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
}

ipcMain.handle('desktop:notify', (_event, title: unknown, body: unknown): void => {
  if (typeof title !== 'string' || title.trim() === '') {
    throw new Error('notify: title must be a non-empty string');
  }
  if (typeof body !== 'string' || body.trim() === '') {
    throw new Error('notify: body must be a non-empty string');
  }
  new Notification({ title, body }).show();
});

function openExternalSafe(target: URL): void {
  // Only ever hand http(s) to the OS — file://, smb:// etc. are attack vectors.
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    writeLog('INFO', `Refused to open non-http(s) URL externally: ${target.href}`);
    return;
  }
  shell.openExternal(target.href).catch((err: unknown) => {
    writeLog('ERROR', 'shell.openExternal failed', err instanceof Error ? err.stack : err);
  });
}

function resolveWebDistDir(): string {
  if (app.isPackaged) {
    // In the packaged AppImage, extraResources are placed at process.resourcesPath/web
    // (matching the electron-builder.yml extraResources[].to value).
    return path.join(process.resourcesPath, 'web');
  }
  // Dev: dist/main.js lives in apps/desktop/dist/
  // Web dist lives at apps/web/dist/ — two levels up from dist/, then into web/dist.
  return path.resolve(__dirname, '..', '..', 'web', 'dist');
}

async function bootApi(): Promise<string> {
  const webDistDir = resolveWebDistDir();

  if (fs.existsSync(webDistDir)) {
    process.env['TASKNOTE_STATIC_DIR'] = webDistDir;
    writeLog('INFO', `Static dir set to ${webDistDir}`);
  } else {
    writeLog('INFO', `Web dist not found at ${webDistDir}, skipping static serving`);
  }

  // Import at runtime so side-effect-free (reflects-metadata is already
  // loaded by the api package's own reflect-metadata import on require()).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createServer } = require('@tasknote/api') as typeof import('@tasknote/api');

  writeLog('INFO', 'Booting embedded Nest API on 127.0.0.1:0');

  const nestApp = await createServer({ port: 0, host: '127.0.0.1' });

  const address = nestApp.getHttpServer().address() as { port: number } | null;
  if (!address) {
    throw new Error('HTTP server address is null after listen()');
  }

  const url = `http://127.0.0.1:${address.port}`;
  writeLog('INFO', `Nest API listening on ${url}`);
  return url;
}

function createWindow(apiUrl: string): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width,
    height,
    minWidth: 900,
    minHeight: 600,
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Block navigation to non-local origins — surface attacks or accidental redirects.
  win.webContents.on('will-navigate', (event, targetUrl) => {
    try {
      const target = new URL(targetUrl);
      const origin = new URL(apiUrl);
      if (target.origin !== origin.origin) {
        event.preventDefault();
        writeLog('INFO', `Blocked navigation to external origin: ${targetUrl}`);
        openExternalSafe(target);
      }
    } catch {
      event.preventDefault();
      writeLog('INFO', `Blocked navigation to malformed URL: ${targetUrl}`);
    }
  });

  // Intercept window.open / target=_blank links.
  win.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    try {
      const target = new URL(targetUrl);
      const origin = new URL(apiUrl);
      if (target.origin !== origin.origin) {
        openExternalSafe(target);
        return { action: 'deny' };
      }
    } catch {
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  win.loadURL(apiUrl).catch((err: unknown) => {
    writeLog('ERROR', 'BrowserWindow.loadURL failed', err);
  });
}

app.whenReady()
  .then(async () => {
    let apiUrl: string;

    try {
      apiUrl = await bootApi();
    } catch (err: unknown) {
      writeLog('ERROR', 'Fatal: API failed to boot', err);
      dialog.showErrorBox(
        'TaskNote failed to start',
        `The embedded API could not be started.\n\nError: ${err instanceof Error ? err.message : String(err)}\n\nLog file: ${logPath}`,
      );
      app.quit();
      return;
    }

    createWindow(apiUrl);
    initAutoUpdater(writeLog);

    app.on('activate', () => {
      const { BrowserWindow: BW } = require('electron') as typeof import('electron');
      if (BW.getAllWindows().length === 0) {
        createWindow(apiUrl);
      }
    });
  })
  .catch((err: unknown) => {
    writeLog('ERROR', 'app.whenReady() rejected', err);
    app.quit();
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

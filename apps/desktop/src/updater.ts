import { app } from 'electron';
import { autoUpdater } from 'electron-updater';

type Logger = (level: 'INFO' | 'ERROR', message: string, detail?: unknown) => void;

export function initAutoUpdater(log: Logger): void {
  if (!app.isPackaged) {
    return;
  }

  autoUpdater.on('error', (err: unknown) => {
    log('ERROR', 'Auto-updater error', err);
  });

  autoUpdater.checkForUpdatesAndNotify().catch((err: unknown) => {
    log('ERROR', 'Auto-updater checkForUpdatesAndNotify failed', err);
  });
}

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktop', {
  notify(title: string, body: string): Promise<void> {
    return ipcRenderer.invoke('desktop:notify', title, body) as Promise<void>;
  },
});

// ponytail: desktop tsconfig has no DOM lib; declare the two globals used instead of pulling in lib.dom
declare const window: { addEventListener(type: string, listener: () => void): void };
declare const document: { documentElement: { classList: { add(cls: string): void } } };

if (process.platform === 'darwin') {
  window.addEventListener('DOMContentLoaded', () => {
    document.documentElement.classList.add('desktop-mac');
  });
}

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktop', {
  notify(title: string, body: string): Promise<void> {
    return ipcRenderer.invoke('desktop:notify', title, body) as Promise<void>;
  },
});

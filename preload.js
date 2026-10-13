const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronBridge', {
  invoke: (name, ...args) => ipcRenderer.invoke(name, ...args),
  send: (name, ...args) => ipcRenderer.send(name, ...args),
  on: (name, cb) => ipcRenderer.on(name, (_e, ...args) => cb(...args)),
});

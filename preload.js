const { contextBridge, ipcRenderer } = require('electron');

// Окну острова доступны только перечисленные каналы (список повторяет security.js: в песочнице preload не может подключать файлы).
const INVOKE = /^(settings:(get|set)|update:(get|open)|open:external|(ym|sc|yt|sp|zv|media):[A-Za-z]{1,32})$/;
const SEND = new Set(['win:ignore', 'win:focusable', 'win:box', 'win:drag-start', 'win:drag-move', 'win:drag-end']);
const RECEIVE = new Set(['update', 'settings', 'cmd', 'shift']);

contextBridge.exposeInMainWorld('electronBridge', {
  invoke: (name, ...args) => (INVOKE.test(String(name)) ? ipcRenderer.invoke(name, ...args) : Promise.resolve({ ok: false, error: 'forbidden' })),
  send: (name, ...args) => { if (SEND.has(name)) ipcRenderer.send(name, ...args); },
  on: (name, cb) => { if (RECEIVE.has(name) && typeof cb === 'function') ipcRenderer.on(name, (_e, ...args) => cb(...args)); },
});

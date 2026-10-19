// Подмена моста окна для съёмки ролика: настоящий интерфейс острова без основного процесса
const { contextBridge } = require('electron');
const settings = { alwaysOnTop: true, hoverExpand: true, lockPosition: false, autoStart: false, source: 'sp', mode: 'tracks', shuffle: false,
  eq: { on: false, preset: 'flat', bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], preamp: 0, custom: [] }, tune: {}, providers: {} };
contextBridge.exposeInMainWorld('electronBridge', {
  invoke: async (name) => ({ ok: true, data: name === 'settings:get' || name === 'settings:set' ? settings : null }),
  send: () => {},
  on: () => {},
});

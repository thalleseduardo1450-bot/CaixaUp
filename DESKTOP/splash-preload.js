const { contextBridge, ipcRenderer } = require('electron');

let playRequested = false;
let playCallback = null;
ipcRenderer.once('desktop:splash:play', () => {
  playRequested = true;
  if (playCallback) playCallback();
});

contextBridge.exposeInMainWorld('caixaUpSplash', {
  notify: (state) => {
    if (['playing', 'finished', 'failed', 'skipped', 'dismissed'].includes(state)) {
      ipcRenderer.send('desktop:splash:state', state);
    }
  },
  onPlay: (callback) => {
    if (typeof callback !== 'function') return;
    playCallback = callback;
    if (playRequested) callback();
  },
});

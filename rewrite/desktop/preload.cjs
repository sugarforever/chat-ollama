const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("chatOllamaDesktop", {
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
});

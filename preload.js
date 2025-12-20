const { contextBridge, ipcRenderer} = require('electron')

contextBridge.exposeInMainWorld(
    'electron',
    {
        ipcRendererSend: async (name, ...args) => await ipcRenderer.send(name, ...args),
        ipcRendererInvoke: async (name, ...args) => await ipcRenderer.invoke(name, ...args),
        ipcRendererOn: async (channel, callback) => await ipcRenderer.on(channel, callback),
    }
)


import UnmissStatic from './UnmissStatic';

window.electron.ipcRendererOn("ipc:call", async (event, data) => {
    var {key, name, args} = data;

    if(name in ToBackend.hooks) {
        var value = await ToBackend.hooks[name](...args);

        return await window.electron.ipcRendererSend("ipc:return:" + key, value);
    }

})

class ToBackend {

    static hooks = {};

    static async methodMissing(name, ...args) {
        return await window.electron.ipcRendererInvoke("ipc:call", {
            name: name, 
            args: args
        });
    }

    static hook(name, func) {
        if (typeof name === 'function') {
            ToBackend.hooks[name.name] = name;
        } else {
            ToBackend.hooks[name] = func;
        }

    }

}


export default UnmissStatic(ToBackend);
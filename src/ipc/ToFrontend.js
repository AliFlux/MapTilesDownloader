const { ipcMain } = require('electron');
const UnmissStatic = require('./UnmissStatic');

ipcMain.handle('ipc:call', async (event, data) => {
    var {name, args} = data;

    if(name in ToFrontend.hooks) {
        return await ToFrontend.hooks[name](...args);
    }

});

var lastKey = 0;

class ToFrontend {

    static hooks = {};
    static window = null;

    static attach(window) {
        ToFrontend.window = window;
    }

    static async methodMissing(name, ...args) {
        var key = lastKey++;

        var returnVal = new Promise((resolve, reject) => {
            ipcMain.once("ipc:return:" + key, async (event, data) => {
                resolve(data);
            })
        });
        
        await ToFrontend.window.webContents.send("ipc:call", {
            name: name, 
            args: args,
            key: key,
        });

        return returnVal;
    }

    static hook(name, func) {
        ToFrontend.hooks[name] = func;
    }

}


module.exports = UnmissStatic(ToFrontend);
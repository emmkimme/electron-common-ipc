import { IpcBusClient } from './IpcBusClient';
import { ElectronCommonIpcAPI } from './namespace/IpcBusNamespace';
import { Create as CreateIpcBusClientWindow } from './renderer/IpcBusClientRenderer-factory';
import { PreloadElectronCommonIpcAutomatic } from './namespace/IpcBusNamespace-renderer';

let electron: any;
try {
    // Will work in a preload or with nodeIntegration=true
    electron = require('electron');
}
catch (err) {
}


const windowLocal = window as any;
export const CreateIpcBusClient: IpcBusClient.CreateFunction = () => {
    const ipcWindow = electron?.ipcRenderer;
    // const electronCommonIpcSpace = windowLocal[ElectronCommonIpcAPI];
    // if (electronCommonIpcSpace && electronCommonIpcSpace.CreateIpcBusClient) {
    //     return electronCommonIpcSpace.CreateIpcBusClient();
    // }
    // return null;
    if (ipcWindow) {
        // trace && console.log(`${ElectronCommonIpcAPI}.CreateIpcBusClient`);
        const ipcBusClient = CreateIpcBusClientWindow('renderer', (window.self === window.top), ipcWindow);
        // This instance may be proxyfied and then loose property members
        return ipcBusClient;
    }
    else {
        console.error(`${ElectronCommonIpcAPI}.CreateIpcBusClient - not properly initialized`);
        return null;
    }
}

windowLocal.CreateIpcBusClient = CreateIpcBusClient;
IpcBusClient.Create = CreateIpcBusClient;

PreloadElectronCommonIpcAutomatic();
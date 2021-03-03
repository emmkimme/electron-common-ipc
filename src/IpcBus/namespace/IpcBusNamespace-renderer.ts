import { Create as CreateIpcBusClientWindow } from '../renderer/IpcBusClientRenderer-factory';
import { ActivateIpcBusTrace, ActivateServiceTrace } from '../IpcBusUtils';

import { CreateIpcBusService } from '../service/IpcBusService-factory';
import { CreateIpcBusServiceProxy } from '../service/IpcBusService-factory';

import { ElectronCommonIpcAPI, GetElectronCommonIpcAPI } from './IpcBusNamespace';

let electron: any;
try {
    // Will work in a preload or with nodeIntegration=true
    electron = require('electron');
}
catch (err) {
}

const trace = false; // true;

export function CreateGlobal(): ElectronCommonIpcAPI {
    const ipcWindow = electron?.ipcRenderer;
    return {
        ActivateIpcBusTrace,
        ActivateServiceTrace,
        CreateIpcBusClient: () => {
            if (ipcWindow) {
                trace && console.log(`${ElectronCommonIpcAPI}.CreateIpcBusClient`);
                const ipcBusClient = CreateIpcBusClientWindow('renderer', (window.self === window.top), ipcWindow);
                // This instance may be proxyfied and then loose property members
                return ipcBusClient;
            }
            else {
                console.error(`${ElectronCommonIpcAPI}.CreateIpcBusClient - not properly initialized`);
                return null;
            }
        },
        IpcBusClient: {
            Create: () => {
                if (ipcWindow) {
                    trace && console.log(`${ElectronCommonIpcAPI}.CreateIpcBusClient`);
                    const ipcBusClient = CreateIpcBusClientWindow('renderer', (window.self === window.top), ipcWindow);
                    // This instance may be proxyfied and then loose property members
                    return ipcBusClient;
                }
                else {
                    console.error(`${ElectronCommonIpcAPI}.CreateIpcBusClient - not properly initialized`);
                    return null;
                }
            }
        },
        CreateIpcBusService,
        IpcBusService: {
            Create: CreateIpcBusService
        },
        CreateIpcBusServiceProxy,
        IpcBusServiceProxy: {
            Create:CreateIpcBusServiceProxy
        },
        // CreateIpcBusBroker,
        // IpcBusBroker: {
        //     Create: IpcBusBroker.Create
        // },
        // CreateIpcBusBridge,
        // IpcBusBridge: {
        //     Create: IpcBusBridge.Create
        // },
    }
}

// This function could be called in advance in the preload file of the BrowserWindow
// Then ipcbus is supported in sandbox or nodeIntegration=false process

// By default this function is always trigerred in index-browser in order to offer an access to ipcBus

export function PreloadElectronCommonIpcAutomatic(): boolean {
    return _PreloadElectronCommonIpc();
}

export function PreloadElectronCommonIpc(contextIsolation?: boolean): boolean {
    return _PreloadElectronCommonIpc(contextIsolation);
}

const ContextIsolationDefaultValue = false;

let _PreloadElectronCommonIpcDone = false;
function _PreloadElectronCommonIpc(contextIsolation?: boolean): boolean {
    // trace && console.log(`process.argv:${window.process?.argv}`);
    // trace && console.log(`process.env:${window.process?.env}`);
    // trace && console.log(`contextIsolation:${contextIsolation}`);
    if (contextIsolation == null) {
        contextIsolation = window.process?.argv?.includes('--context-isolation') ?? ContextIsolationDefaultValue;
    }
    if (!_PreloadElectronCommonIpcDone) {
        _PreloadElectronCommonIpcDone = true;
        if (contextIsolation) {
            try {
                electron.contextBridge.exposeInMainWorld(ElectronCommonIpcAPI, CreateGlobal());
            }
            catch (error) {
                console.error(error);
                contextIsolation = false;
            }
        }

        if (!contextIsolation) {
            (globalThis as any)[ElectronCommonIpcAPI] = CreateGlobal();
        }
    }
    return (GetElectronCommonIpcAPI() != null);

}


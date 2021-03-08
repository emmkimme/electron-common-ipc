import { IpcBusClient } from '../IpcBusClient';
import { CreateIpcBusClient } from '../IpcBusClient-factory-browser';
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

export function CreateGlobal(): ElectronCommonIpcAPI {
    return {
        ActivateIpcBusTrace,
        ActivateServiceTrace,
        CreateIpcBusClient,
        IpcBusClient: {
            Create: IpcBusClient.Create
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


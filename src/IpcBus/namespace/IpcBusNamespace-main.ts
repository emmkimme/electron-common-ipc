import { CreateIpcBusClient } from '../IpcBusClient-factory';
import { IpcBusClient } from '../IpcBusClient';
import { CreateIpcBusBroker } from '../node/IpcBusBroker-factory';
import { IpcBusBroker } from '../node/IpcBusBroker';
import { CreateIpcBusBridge } from '../main/IpcBusBridge-factory';
import { IpcBusBridge } from '../main/IpcBusBridge';
import { CreateIpcBusService } from '../service/IpcBusService-factory';
import { IpcBusService } from '../service/IpcBusService';
import { CreateIpcBusServiceProxy } from '../service/IpcBusService-factory';
import { IpcBusServiceProxy } from '../service/IpcBusService';

import { ActivateIpcBusTrace, ActivateServiceTrace } from '../IpcBusUtils';

import { ElectronCommonIpcAPI, GetElectronCommonIpcAPI } from './IpcBusNamespace';

export function CreateGlobal() {
    return {
        CreateIpcBusClient,
        ActivateIpcBusTrace,
        ActivateServiceTrace,
        IpcBusClient: {
            Create: IpcBusClient.Create
        },
        CreateIpcBusService,
        IpcBusService: {
            Create: IpcBusService.Create
        },
        CreateIpcBusServiceProxy,
        IpcBusServiceProxy: {
            Create: IpcBusServiceProxy.Create
        },
        CreateIpcBusBroker,
        IpcBusBroker: {
            Create: IpcBusBroker.Create
        },
        CreateIpcBusBridge,
        IpcBusBridge: {
            Create: IpcBusBridge.Create
        },
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

let _PreloadElectronCommonIpcDone = false;
function _PreloadElectronCommonIpc(contextIsolation?: boolean): boolean {
    if (!_PreloadElectronCommonIpcDone) {
        _PreloadElectronCommonIpcDone = true;
        (globalThis as any)[ElectronCommonIpcAPI] = CreateGlobal();
    }
    return (GetElectronCommonIpcAPI() != null);

}



import type { IpcBusClient } from '../IpcBusClient';
import type { IpcBusBroker } from '../node/IpcBusBroker';
import type { IpcBusBridge } from '../main/IpcBusBridge';
import type { IpcBusService } from '../service/IpcBusService';
import type { IpcBusServiceProxy } from '../service/IpcBusService';

export const ElectronCommonIpcAPI = 'ElectronCommonIpc';

export interface ElectronCommonIpcAPI {
    // Node and Electron main and Electron renderer only
    ActivateIpcBusTrace: (enable: boolean) => void,
    ActivateServiceTrace: (enable: boolean) => void,

    CreateIpcBusClient: IpcBusClient.CreateFunction,
    IpcBusClient: {
        Create: IpcBusClient.CreateFunction
    },
    CreateIpcBusService: IpcBusService.CreateFunction,
    IpcBusService: {
        Create: IpcBusService.CreateFunction
    },
    CreateIpcBusServiceProxy: IpcBusServiceProxy.CreateFunction,
    IpcBusServiceProxy: {
        Create: IpcBusServiceProxy.CreateFunction
    },

    // Node and Electron main only
    CreateIpcBusBroker?: IpcBusBroker.CreateFunction,
    IpcBusBroker?: {
        Create: IpcBusBroker.CreateFunction
    },

    // Electron main only
    CreateIpcBusBridge?: IpcBusBridge.CreateFunction,
    IpcBusBridge?: {
        Create: IpcBusBridge.CreateFunction
    },
}

export function GetElectronCommonIpcAPI(): ElectronCommonIpcAPI | null {
    try {
        const electronCommonIpcNamespace = (globalThis as any)[ElectronCommonIpcAPI];
        return electronCommonIpcNamespace;
    }
    catch (err) {
    }
    return null;
}

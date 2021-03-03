import { IpcBusClient } from './IpcBusClient';
import { ElectronCommonIpcAPI } from './namespace/IpcBusNamespace';
import { PreloadElectronCommonIpcAutomatic } from './namespace/IpcBusNamespace-renderer';

const windowLocal = window as any;
export const CreateIpcBusClient: IpcBusClient.CreateFunction = () => {
    const electronCommonIpcSpace = windowLocal[ElectronCommonIpcAPI];
    if (electronCommonIpcSpace && electronCommonIpcSpace.CreateIpcBusClient) {
        return electronCommonIpcSpace.CreateIpcBusClient();
    }
    return null;
}

windowLocal.CreateIpcBusClient = CreateIpcBusClient;
IpcBusClient.Create = CreateIpcBusClient;

PreloadElectronCommonIpcAutomatic();
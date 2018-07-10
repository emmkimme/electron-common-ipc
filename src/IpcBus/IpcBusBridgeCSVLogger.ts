import * as path from 'path';
import * as fs from 'fs';

const csvWriter = require('csv-write-stream');

import { IpcPacketBuffer } from 'socket-serializer';

import * as IpcBusInterfaces from './IpcBusInterfaces';

import { IpcBusCommand } from './IpcBusCommand';
import { IpcBusBridgeLogger } from './IpcBusBridgeLogger';

// This class ensures the transfer of data between Broker and Renderer/s using ipcMain
/** @internal */
export class IpcBusBridgeCSVLogger extends IpcBusBridgeLogger {
    private _logger: any;
    private _line: number;

    constructor(logPath: string, processType: IpcBusInterfaces.IpcBusProcessType, options: IpcBusInterfaces.IpcBusBroker.CreateOptions) {
        super(processType, options);

        this._line = 0;

        !fs.existsSync(logPath) && fs.mkdirSync(logPath);

        this._logger = csvWriter({ separator: ';', headers: ['#', 'kind', 'size', 'peer id', 'peer process', 'arg0', 'arg1', 'arg2', 'arg3', 'arg4', 'arg5' ]});
        this._logger.pipe(fs.createWriteStream(path.join(logPath, 'electron-common-ipcbus-bridge.csv')));
    }

    protected addLog(webContents: Electron.WebContents, ipcPacketBuffer: IpcPacketBuffer, ipcBusCommand: IpcBusCommand, args: any[]): any {
        ++this._line;
        let log: string[] = [ this._line.toString(),  ipcBusCommand.kind, ipcPacketBuffer.packetSize.toString(), ipcBusCommand.peer.id, JSON.stringify(ipcBusCommand.peer.process) ];
        if (args) {
            for (let i = 0, l = args.length; i < l; ++i) {
                log.push(args[i]);
            }
        }
        this._logger.write(log);
    }
}


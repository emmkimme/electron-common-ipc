import * as assert from 'assert';
import type { EventEmitter } from 'events';

import { IpcPacketBuffer } from 'socket-serializer';

import * as IpcBusUtils from '../IpcBusUtils';
import type * as Client from '../IpcBusClient';
import type { IpcBusCommand } from '../IpcBusCommand';
import type { IpcBusConnector } from '../IpcBusConnector';
import { IpcBusConnectorImpl } from '../IpcBusConnectorImpl';

import { IpcBusRendererContent } from './IpcBusRendererContent';

export const IPCBUS_TRANSPORT_RENDERER_HANDSHAKE = 'ECIPC:IpcBusRenderer:Handshake';
export const IPCBUS_TRANSPORT_RENDERER_COMMAND_RAWDATA = 'ECIPC:IpcBusRenderer:CommandRawData';
export const IPCBUS_TRANSPORT_RENDERER_COMMAND_ARGS = 'ECIPC:IpcBusRenderer:CommandArgs';

export interface IpcWindow extends EventEmitter {
    send(channel: string, ...args: any[]): void;
    sendTo(webContentsId: number, channel: string, ...args: any[]): void;
}

// Implementation for renderer process
/** @internal */
export class IpcBusConnectorRenderer extends IpcBusConnectorImpl {
    private _ipcWindow: IpcWindow;
    private _onIpcEventRawDataReceived: (...args: any[]) => void;
    private _onIpcEventArgsReceived: (...args: any[]) => void;
    private _useElectronSerialization: boolean;

    constructor(contextType: Client.IpcBusProcessType, ipcWindow: IpcWindow) {
        assert(contextType === 'renderer', `IpcBusTransportWindow: contextType must not be a ${contextType}`);
        super(contextType);
        this._ipcWindow = ipcWindow;

        window.addEventListener('beforeunload', (event: BeforeUnloadEvent) => {
            this.onConnectorBeforeShutdown();
            this.onConnectorShutdown();
        });
        // window.addEventListener("pagehide", (event: PageTransitionEvent) => {
        //     if (event.persisted) {
        //     }
        //     else {
        //         this.onConnectorBeforeShutdown();
        //         this.onConnectorShutdown();
        //     }
        // });

        // window.addEventListener('unload', (event: BeforeUnloadEvent) => {
        //     this.onConnectorBeforeShutdown();
        //     this.onConnectorShutdown();
        // });
    }

    protected onConnectorBeforeShutdown() {
        super.onConnectorBeforeShutdown();
        if (this._onIpcEventRawDataReceived) {
            this._ipcWindow.removeListener(IPCBUS_TRANSPORT_RENDERER_COMMAND_RAWDATA, this._onIpcEventRawDataReceived);
            this._ipcWindow.removeListener(IPCBUS_TRANSPORT_RENDERER_COMMAND_ARGS, this._onIpcEventArgsReceived);
            this._onIpcEventRawDataReceived = null;
        }
    }

    protected _onConnect(eventOrPeer: any, peerOrArgs: Client.IpcBusPeer | IpcBusConnector.Handshake, handshakeArg: IpcBusConnector.Handshake): IpcBusConnector.Handshake {
        // IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IPCBusTransport:Window] _onConnect`);
        let handshake: IpcBusConnector.Handshake;
        // In sandbox mode, 1st parameter is no more the event, but directly arguments !!!
        if (handshakeArg) {
            // IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IPCBusTransport:Window] Sandbox off listening for #${this._messageId}`);
            handshake = handshakeArg;
            this._onIpcEventRawDataReceived = (event, ipcBusCommand, rawContent) => {
                IpcBusRendererContent.FixRawContent(rawContent);
                // IpcBusRendererContent.UnpackRawContent(rawContent);
                this._client.onConnectorContentReceived(ipcBusCommand, rawContent);
            };
            this._onIpcEventArgsReceived = (event, ipcBusCommand, args) => {
                this._client.onConnectorArgsReceived(ipcBusCommand, args);
            };
        }
        else {
            handshake = peerOrArgs as IpcBusConnector.Handshake;
            this._onIpcEventRawDataReceived = (ipcBusCommand, rawContent) => {
                IpcBusRendererContent.FixRawContent(rawContent);
                // IpcBusRendererContent.UnpackRawContent(rawContent);
                this._client.onConnectorContentReceived(ipcBusCommand, rawContent);
            };
            this._onIpcEventArgsReceived = (ipcBusCommand, args) => {
                this._client.onConnectorArgsReceived(ipcBusCommand, args);
            };
        }
        this._useElectronSerialization = handshake.useIPCNativeSerialization;
        // Keep the this._process ref intact as shared with client peers
        this._process = Object.assign(this._process, handshake.process);
        this._log.level = handshake.logLevel;
        this._ipcWindow.addListener(IPCBUS_TRANSPORT_RENDERER_COMMAND_RAWDATA, this._onIpcEventRawDataReceived);
        this._ipcWindow.addListener(IPCBUS_TRANSPORT_RENDERER_COMMAND_ARGS, this._onIpcEventArgsReceived);
        return handshake;
    };

    /// IpcBusTrandport API
    handshake(client: IpcBusConnector.Client, options: Client.IpcBusClient.ConnectOptions): Promise<IpcBusConnector.Handshake> {
        return this._connectCloseState.connect(() => {
            return new Promise<IpcBusConnector.Handshake>((resolve, reject) => {
                // Do not type timer as it may differ between node and browser api, let compiler and browserify deal with.
                let timer: NodeJS.Timer;
                const onIpcConnect = (eventOrPeer: any, peerOrArgs: Client.IpcBusPeer | IpcBusConnector.Handshake, handshakeArg: IpcBusConnector.Handshake) => {
                    clearTimeout(timer);
                    this._ipcWindow.removeListener(IPCBUS_TRANSPORT_RENDERER_HANDSHAKE, onIpcConnect);
                    this.addClient(client);
                    const handshake = this._onConnect(eventOrPeer, peerOrArgs, handshakeArg);
                    resolve(handshake);
                };

                // Below zero = infinite
                options = IpcBusUtils.CheckConnectOptions(options);
                if (options.timeoutDelay >= 0) {
                    timer = setTimeout(() => {
                        timer = null;
                        this._ipcWindow.removeListener(IPCBUS_TRANSPORT_RENDERER_HANDSHAKE, onIpcConnect);
                        reject('timeout');
                    }, options.timeoutDelay);
                }
                // We wait for the bridge confirmation
                this._ipcWindow.addListener(IPCBUS_TRANSPORT_RENDERER_HANDSHAKE, onIpcConnect);
                this._ipcWindow.send(IPCBUS_TRANSPORT_RENDERER_HANDSHAKE, client.peer);
            });
        });
    }

    shutdown(options?: Client.IpcBusClient.CloseOptions): Promise<void> {
        return this._connectCloseState.close(() => {
            this.onConnectorBeforeShutdown();
            this.onConnectorShutdown();
            return Promise.resolve();
        });
    }

    postDirectMessage(ipcBusCommand: IpcBusCommand, args?: any[]): void {
        if (this._useElectronSerialization) {
            const webContentsTargetIds = IpcBusUtils.GetWebContentsIdentifier(ipcBusCommand.channel);
            if (webContentsTargetIds && (webContentsTargetIds.frameid === IpcBusUtils.TopFrameId)) {
                this._ipcWindow.sendTo(webContentsTargetIds.wcid, IPCBUS_TRANSPORT_RENDERER_COMMAND_ARGS, ipcBusCommand, args);
            }
            else {
                this._ipcWindow.send(IPCBUS_TRANSPORT_RENDERER_COMMAND_ARGS, ipcBusCommand, args);
            }
        }
        else {
            const packetOut = new IpcPacketBuffer();
            packetOut.serialize([ipcBusCommand, args]);
            const rawContent = packetOut.getRawData();
            const webContentsTargetIds = IpcBusUtils.GetWebContentsIdentifier(ipcBusCommand.channel);
            if (webContentsTargetIds && (webContentsTargetIds.frameid === IpcBusUtils.TopFrameId)) {
                this._ipcWindow.sendTo(webContentsTargetIds.wcid, IPCBUS_TRANSPORT_RENDERER_COMMAND_RAWDATA, ipcBusCommand, rawContent);
            }
            else {
                this._ipcWindow.send(IPCBUS_TRANSPORT_RENDERER_COMMAND_RAWDATA, ipcBusCommand, rawContent);
            }
        }
    }

    // We serialize in renderer process to save master CPU.
    // We keep ipcBusCommand in plain text, once again to have master handling it easily
    postCommand(ipcBusCommand: IpcBusCommand, args?: any[]): void {
        if (this._useElectronSerialization) {
            this._ipcWindow.send(IPCBUS_TRANSPORT_RENDERER_COMMAND_ARGS, ipcBusCommand, args);
        }
        else {
            const packetOut = new IpcPacketBuffer();
            packetOut.serialize([ipcBusCommand, args]);
            const rawContent = packetOut.getRawData();
            this._ipcWindow.send(IPCBUS_TRANSPORT_RENDERER_COMMAND_RAWDATA, ipcBusCommand, rawContent);
        }
    }

    postBuffers(buffers: Buffer[]) {
        throw 'not implemented';
    }
}

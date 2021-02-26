import { IpcPacketBuffer, IpcPacketBufferCore, IpcPacketBufferList } from 'socket-serializer';

import type * as Client from './IpcBusClient';
import * as IpcBusUtils from './IpcBusUtils';
import { IpcBusCommand } from './IpcBusCommand';

import type { IpcBusTransport } from './IpcBusTransport';
import type { IpcBusConnector } from './IpcBusConnector';

/** @internal */
class DeferredRequestPromise {
    public promise: Promise<Client.IpcBusRequestResponse>;

    public resolve: (value: Client.IpcBusRequestResponse) => void;
    public reject: (err: Client.IpcBusRequestResponse) => void;

    client: IpcBusTransport.Client;
    request: IpcBusCommand.Request;

    private _settled: boolean;

    constructor(client: IpcBusTransport.Client, request: IpcBusCommand.Request) {
        this.client = client;
        this.request = request;
        this.promise = new Promise<Client.IpcBusRequestResponse>((resolve, reject) => {
            this.reject = reject;
            this.resolve = resolve;
        })
        // Prevent unhandled rejected promise
        this.promise.catch(() => { });
        this._settled = false;
    }

    isSettled(): boolean {
        return this._settled;
    }

    settled(ipcBusCommand: IpcBusCommand, args: any[]) {
        if (this._settled === false) {
            const ipcBusEvent: Client.IpcBusEvent = { channel: ipcBusCommand.request.channel, sender: ipcBusCommand.peer };
            IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IPCBusTransport] Peer #${ipcBusEvent.sender.name} replied to request on ${ipcBusCommand.request.replyChannel}`);
            try {
                if (ipcBusCommand.request.resolve) {
                    IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IPCBusTransport] resolve`);
                    const response: Client.IpcBusRequestResponse = { event: ipcBusEvent, payload: args[0] };
                    this.resolve(response);
                }
                else if (ipcBusCommand.request.reject) {
                    IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IPCBusTransport] reject: ${args[0]}`);
                    const response: Client.IpcBusRequestResponse = { event: ipcBusEvent, err: args[0] };
                    this.reject(response);
                }
                else {
                    throw 'unknown format';
                }
            }
            catch (err) {
                IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IPCBusTransport] reject: ${err}`);
                const response: Client.IpcBusRequestResponse = { event: ipcBusEvent, err };
                this.reject(response);
            }
            this._settled = true;
        }
    }

    timeout(): void {
        const response: Client.IpcBusRequestResponse = {
            event: {
                channel: this.request.channel,
                sender: this.client.peer
            },
            err: 'timeout'
        };
        this.reject(response);
    }
}

/** @internal */
export abstract class IpcBusTransportImpl implements IpcBusTransport, IpcBusConnector.Client {
    private static s_clientNumber: number = 0;

    protected _connector: IpcBusConnector;
    protected _directChannel: string;

    protected _peer: Client.IpcBusPeer;
    protected _logActivate: boolean;

    protected _requestFunctions: Map<string, DeferredRequestPromise>;
    protected _postCommand: Function;
    protected _postDirectMessage: Function;

    constructor(connector: IpcBusConnector) {
        this._connector = connector;

        this._peer = { 
            id: `t_${connector.process.type}.${IpcBusUtils.CreateUniqId()}`,
            name: 'IPCTransport',
            process: connector.process
        };
        this._requestFunctions = new Map();
        this._postDirectMessage = this._postCommand = () => { };
    }

    get peer(): Client.IpcBusPeer {
        return this._peer;
    }

    protected createPeer(process: Client.IpcBusProcess, name?: string): Client.IpcBusPeer {
        const peer: Client.IpcBusPeer = { 
            id: `${process.type}.${IpcBusUtils.CreateUniqId()}`,
            process,
            name: ''
        }
        peer.name = this.generateName(peer, name);
        return peer;
    }

    protected generateName(peer: Client.IpcBusPeer, name?: string) : string {
        if (name == null) {
            // static part
            name = `${peer.process.type}`;
            if (peer.process.wcid) {
                name += `-${peer.process.wcid}`;
            }
            if (peer.process.frameid) {
                name += `-f${peer.process.frameid}`;
            }
            if (peer.process.rid && (peer.process.rid !== peer.process.wcid)) {
                name += `-r${peer.process.rid}`;
            }
            if (peer.process.pid) {
                name += `-p${peer.process.pid}`;
            }
            // dynamic part
            ++IpcBusTransportImpl.s_clientNumber;
            name += `.${IpcBusTransportImpl.s_clientNumber}`;
        }
        return name;
    }

    createDirectChannel(client: IpcBusTransport.Client): string {
        return `${this._directChannel}_p${client.peer.id}_${IpcBusUtils.CreateUniqId()}`;
    }

    // We assume prior to call this function client is not empty and have listeners for this channel !!
    protected _onClientMessageReceived(client: IpcBusTransport.Client, local: boolean, ipcBusCommand: IpcBusCommand, args?: any[]): boolean {
        const listeners = client.listeners(ipcBusCommand.channel);
        if (listeners.length === 0) {
            return false;
        }
        // IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IPCBusTransport] Emit message received on channel '${ipcBusCommand.channel}' from peer #${ipcBusCommand.peer.name}`);
        let logGetMessage: IpcBusCommand.Log;
        if (this._logActivate) {
            logGetMessage = this._connector.logMessageGet(client.peer, local, ipcBusCommand, args);
        }
        const ipcBusEvent: Client.IpcBusEvent = { channel: ipcBusCommand.channel, sender: ipcBusCommand.peer };
        if (ipcBusCommand.request) {
            const settled = (resolve: boolean, argsResponse: any[]) => {
                // Reset functions as only one response per request is accepted
                ipcBusEvent.request.resolve = () => {};
                ipcBusEvent.request.reject = () => {};
                const ipcBusCommandResponse: IpcBusCommand = {
                    kind: IpcBusCommand.Kind.RequestResponse,
                    channel: ipcBusCommand.request.replyChannel,
                    peer: client.peer,
                    request: ipcBusCommand.request
                };
                if (resolve) {
                    ipcBusCommand.request.resolve = true;
                }
                else {
                    ipcBusCommand.request.reject = true;
                }
                // Is it a local request ?
                if (this._logActivate) {
                   this._connector.logMessageSend(logGetMessage, ipcBusCommandResponse);
                } 
                if (local) {
                    if (this._onResponseReceived(true, ipcBusCommandResponse, argsResponse) && logGetMessage) {
                        this._connector.logLocalMessage(client.peer, ipcBusCommandResponse, argsResponse);
                    }
                }
                else {
                    this._postDirectMessage(ipcBusCommandResponse, argsResponse);
                }
            }
            ipcBusEvent.request = {
                resolve: (payload: Object | string) => {
                    IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IPCBusTransport] Resolve request received on channel '${ipcBusCommand.channel}' from peer #${ipcBusCommand.peer.name} - payload: ${JSON.stringify(payload)}`);
                    settled(true, [payload]);
                },
                reject: (err: string) => {
                    IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IPCBusTransport] Reject request received on channel '${ipcBusCommand.channel}' from peer #${ipcBusCommand.peer.name} - err: ${JSON.stringify(err)}`);
                    settled(false, [err]);
                }
            };
        }
        for (let i = 0, l = listeners.length; i < l; ++i) {
            listeners[i].call(client, ipcBusEvent, ...args);
        }
        return true;
    }

    protected _onResponseReceived(local: boolean, ipcBusCommand: IpcBusCommand, args: any[], ipcPacketBufferCore?: IpcPacketBufferCore): boolean {
        const deferredRequest = this._requestFunctions.get(ipcBusCommand.channel);
        if (deferredRequest) {
            args = args || ipcPacketBufferCore.parseArrayAt(1);
            if (this._logActivate) {
                this._connector.logMessageGet(deferredRequest.client.peer, local, ipcBusCommand, args);
            }
            // IpcBusUtils.Logger.enable && IpcBusUtils.Logger.info(`[IPCBusTransport] Emit request response received on channel '${ipcBusCommand.channel}' from peer #${ipcBusCommand.peer.name} (replyChannel '${ipcBusCommand.request.replyChannel}')`);
            this._requestFunctions.delete(ipcBusCommand.request.replyChannel);
            deferredRequest.settled(ipcBusCommand, args);
            return true;
        }
        return false;
    }

    // IpcConnectorClient~getArgs
    onConnectorArgsReceived(ipcBusCommand: IpcBusCommand, args: any[]): boolean {
        switch (ipcBusCommand.kind) {
            case IpcBusCommand.Kind.SendMessage: {
                return this._onMessageReceived(false, ipcBusCommand, args);
            }
            case IpcBusCommand.Kind.RequestResponse:
                return this._onResponseReceived(false, ipcBusCommand, args);
        }
        return false;
    }

    // IpcConnectorClient
    onConnectorPacketReceived(ipcBusCommand: IpcBusCommand, ipcPacketBufferCore: IpcPacketBufferCore): boolean {
        switch (ipcBusCommand.kind) {
            case IpcBusCommand.Kind.SendMessage: {
                if (this.hasChannel(ipcBusCommand.channel)) {
                    const args = ipcPacketBufferCore.parseArrayAt(1);
                    return this._onMessageReceived(false, ipcBusCommand, args);
                }
                break;
            }
            case IpcBusCommand.Kind.RequestResponse:
                return this._onResponseReceived(false, ipcBusCommand, undefined, ipcPacketBufferCore);
        }
        return false;
    }

    // IpcConnectorClient
    onConnectorRawDataReceived(ipcBusCommand: IpcBusCommand, rawContent: IpcPacketBuffer.RawData): boolean {
        // Prevent to create a huge buffer if not needed, keep working on a set of buffers
        const ipcPacketBufferCore = rawContent.buffer ? new IpcPacketBuffer(rawContent) : new IpcPacketBufferList(rawContent);
        return this.onConnectorPacketReceived(ipcBusCommand, ipcPacketBufferCore);
    }

    // IpcConnectorClient
    onConnectorShutdown() {
        this._directChannel = '';
        // Cut connection
        this._postDirectMessage = this._postCommand = () => {};
        // no messages to send, it is too late
    }

    // IpcConnectorClient
    onConnectorBeforeShutdown() {
        this.cancelRequest();
    }

    sendMessage(client: IpcBusTransport.Client, channel: string, args: any[]): void {
        const ipcMessage: IpcBusCommand = {
            kind: IpcBusCommand.Kind.SendMessage,
            channel,
            peer: client.peer
        }
        if (this._logActivate) {
            this._connector.logMessageSend(null, ipcMessage);
        }
        // Broadcast locally
        if (this.hasChannel(channel)) {
            this._onMessageReceived(true, ipcMessage, args);
        }
        this._postDirectMessage(ipcMessage, args);
    }

    protected cancelRequest(client?: IpcBusTransport.Client): void {
        this._requestFunctions.forEach((request, key) => {
            if ((client == null) || (client === request.client)) {
                request.timeout();
                this._requestFunctions.delete(key);
                const ipcRequestClose: IpcBusCommand = {
                    kind: IpcBusCommand.Kind.RequestClose,
                    channel: request.request.channel,
                    peer: request.client.peer,
                    request: request.request
                };
                if (this._logActivate) {
                    this._connector.logMessageSend(null, ipcRequestClose);
                }
                this._postCommand(ipcRequestClose);
            }
        });
    }

    requestMessage(client: IpcBusTransport.Client, channel: string, timeoutDelay: number, args: any[]): Promise<Client.IpcBusRequestResponse> {
        timeoutDelay = IpcBusUtils.checkTimeout(timeoutDelay);
        const ipcBusCommandRequest: IpcBusCommand.Request = {
            channel,
            replyChannel: this.createDirectChannel(client)
        };
        const deferredRequest = new DeferredRequestPromise(client, ipcBusCommandRequest);
        // Register locally
        this._requestFunctions.set(ipcBusCommandRequest.replyChannel, deferredRequest);
        const ipcMessage: IpcBusCommand = {
            kind: IpcBusCommand.Kind.SendMessage,
            channel,
            peer: client.peer,
            request: ipcBusCommandRequest
        }
        let logSendMessage: IpcBusCommand.Log;
        if (this._logActivate) {
            logSendMessage = this._connector.logMessageSend(null, ipcMessage);
        }
        // Broadcast locally
        if (this.hasChannel(channel)) {
            this._onMessageReceived(true, ipcMessage, args);
        }
        if (deferredRequest.isSettled()) {
            this._connector.logLocalMessage(client.peer, ipcMessage, args);
        }
        // If not resolved by local clients
        else {
            // Clean-up
            if (timeoutDelay >= 0) {
                setTimeout(() => {
                    if (this._requestFunctions.delete(ipcBusCommandRequest.replyChannel)) {
                        deferredRequest.timeout();
                        const ipcRequestClose: IpcBusCommand = {
                            kind: IpcBusCommand.Kind.RequestClose,
                            channel,
                            peer: client.peer,
                            request: ipcBusCommandRequest
                        };
                        if (logSendMessage) {
                            this._connector.logMessageSend(logSendMessage, ipcRequestClose);
                        }
                        this._postCommand(ipcRequestClose);
                    }
                }, timeoutDelay);
            }
            this._postDirectMessage(ipcMessage, args);
        }
        return deferredRequest.promise;
    }

    connect(client: IpcBusTransport.Client | null, options: Client.IpcBusClient.ConnectOptions): Promise<Client.IpcBusPeer> {
        return this._connector.handshake(this, options)
        .then((handshake) => {
            this._logActivate = handshake.logLevel > 0;
            this._directChannel = IpcBusUtils.CreateDirectProcessChannel(handshake.process);
            // Connect to ... connector
            this._postCommand = this._connector.postCommand.bind(this._connector);
            this._postDirectMessage = this._connector.postDirectMessage.bind(this._connector);
            return handshake;
        })
        .then((handshake) => {
            const peer = this.createPeer(handshake.process, options.peerName);
            return peer;
        });
    }

    close(client: IpcBusTransport.Client | null, options?: Client.IpcBusClient.ConnectOptions): Promise<void> {
        return this._connector.shutdown(options);
    }

    abstract hasChannel(channel: string): boolean;
    abstract getChannels(): string[];

    abstract addChannel(client: IpcBusTransport.Client, channel: string, count?: number): void;
    abstract removeChannel(client: IpcBusTransport.Client, channel?: string, all?: boolean): void;

    protected abstract _onMessageReceived(local: boolean, ipcBusCommand: IpcBusCommand, args: any[]): boolean;
}

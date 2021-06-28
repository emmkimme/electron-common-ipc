import type * as Client from './IpcBusClient';
import { IpcBusCommand } from './IpcBusCommand';
import { IpcBusTransportImpl } from './IpcBusTransportImpl';
import type { IpcBusTransport } from './IpcBusTransport';
import type { IpcBusConnector } from './IpcBusConnector';
import { ChannelConnectionMap } from './IpcBusChannelMap';

/** @internal */
export class IpcBusTransportMultiImpl extends IpcBusTransportImpl {
    protected _subscriptions: ChannelConnectionMap<IpcBusTransport.Client, string>;

    constructor(connector: IpcBusConnector) {
        super(connector);
    }

    isTarget(ipcBusCommand: IpcBusCommand): boolean {
        if (this._subscriptions && this._subscriptions.hasChannel(ipcBusCommand.channel)) {
            return true;
        }
        return super.isTarget(ipcBusCommand);
    }

    getChannels(): string[] {
        return this._subscriptions ? this._subscriptions.getChannels() : [];
    }

    protected _onMessageReceived(local: boolean, ipcBusCommand: IpcBusCommand, args: any[]): boolean {
        const channelConns = this._subscriptions.getChannelConns(ipcBusCommand.channel);
        if (channelConns) {
            channelConns.forEach((connData) => {
                this._onClientMessageReceived(connData.conn, local, ipcBusCommand, args);
            });
            return true;
        }
        return false;
    }

    onConnectorBeforeShutdown() {
        super.onConnectorBeforeShutdown();
        if (this._subscriptions) {
            this._subscriptions.client = null;
            this._subscriptions = null;
            this._postCommand({
                kind: IpcBusCommand.Kind.RemoveListeners,
                channel: ''
            });
        }
    }

    connect(client: IpcBusTransport.Client | null, options: Client.IpcBusClient.ConnectOptions): Promise<Client.IpcBusPeer> {
        return super.connect(client, options)
            .then((peer) => {
                if (this._subscriptions == null) {
                    this._subscriptions = new ChannelConnectionMap<IpcBusTransport.Client, string>('');

                    this._subscriptions.client = {
                        channelAdded: (channel) => {
                            this._postCommand({
                                kind: IpcBusCommand.Kind.AddChannelListener,
                                channel
                            })
                        },
                        channelRemoved: (channel) => {
                            this._postCommand({
                                kind: IpcBusCommand.Kind.RemoveChannelListener,
                                channel
                            });
                        }
                    };
                }
                else {
                    // TODO send all existing channels
                }
                return peer;
            });
    }

    close(client: IpcBusTransport.Client, options?: Client.IpcBusClient.CloseOptions): Promise<void> {
        if (this._subscriptions) {
            this.cancelRequest(client);
            this.removeChannel(client);
            if (this._subscriptions.getChannelsCount() === 0) {
                this._subscriptions.client = null;
                this._subscriptions = null;
                return super.close(client, options);
            }
        }
        return Promise.resolve();
    }

    addChannel(client: IpcBusTransport.Client, channel: string, count?: number) {
        if ((this._subscriptions == null) || (client.peer == null)) {
            return;
        }
        this._subscriptions.addRefCount(channel, client.peer.id, client, client.peer, count);
    }

    removeChannel(client: IpcBusTransport.Client, channel?: string, all?: boolean) {
        if ((this._subscriptions == null) || (client.peer == null)) {
            return;
        }
        if (channel) {
            if (all) {
                this._subscriptions.releaseAll(channel, client.peer.id, client.peer);
            }
            else {
                this._subscriptions.release(channel, client.peer.id, client.peer);
            }
        }
        else {
            this._subscriptions.removePeer(client.peer);
        }
    }
}

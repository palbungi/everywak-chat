import { WebSocket } from 'ws';
import { ChatChannel } from './channel.js';
import { ChatType } from './types.chat.js';

export class Client {
  socket: WebSocket;
  userId: string;
  lastPing: number;
  channels: ChatChannel[];

  constructor(socket: WebSocket) {
    this.socket = socket;
    this.userId = '';
    this.lastPing = Date.now();
    this.channels = [];
  }

  send = (type: ChatType, body?: any, success?: boolean) => {
    if (this.socket.readyState !== this.socket.OPEN) {
      throw new Error(`Client '${this.userId}' is not open`);
    }
    this.socket.send(
      JSON.stringify({
        type,
        ...(body ? { body } : {}),
        ...(success !== undefined ? { success } : {}),
      }),
    );
  };
}

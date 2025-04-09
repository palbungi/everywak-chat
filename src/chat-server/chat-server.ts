import { IncomingMessage } from 'http';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { ChatChannel } from './channel.js';
import {
  Chat,
  ChatJoinRequest,
  ChatLoginRequest,
  ChatPartRequest,
  ChatType,
} from './types.chat.js';
import { Client } from './client.js';
import { Logger } from '../utils/logger.js';

export class ChatServer {
  socket: WebSocketServer;
  port: number;

  channels: ChatChannel[] = [];
  clients: Client[] = [];

  loopCheckAlive: NodeJS.Timeout;
  checkAliveInterval = 10000;
  checkAliveTimeout = 30000;

  log: Logger;

  constructor(port: number) {
    this.port = port;
    this.socket = new WebSocketServer({ port });

    this.socket.on('connection', this.onConnection);

    this.loopCheckAlive = setInterval(
      this.checkClientsAlive,
      this.checkAliveInterval,
    );
    this.log = new Logger('everywak-chat', true);
  }

  checkClientsAlive = () => {
    const now = Date.now();
    this.clients.forEach((client) => {
      if (now - client.lastPing > this.checkAliveTimeout) {
        client.socket.close();
      }
    });
    this.log.verbose(`Check alive: ${this.clients.length}`);
  };

  onConnection = (client: WebSocket, request: IncomingMessage) => {
    this.addClient(client);
    client.on('message', (msg) => {
      this.onMessage(client, msg);
    });
    client.on('close', () => {
      this.onClose(client);
    });
  };

  onClose = (websocket: WebSocket) => {
    try {
      this.removeClient(this.getClientBySocket(websocket)!);
    } catch (e) {
      console.error(e);
    }
  };

  addClient = (socket: WebSocket) => {
    this.clients.push(new Client(socket));
    this.log.info(`Client connected: ${this.clients.length}`);
  };

  getClientBySocket = (socket: WebSocket) => {
    const client = this.clients.find((client) => client.socket === socket);
    if (!client) {
      throw new Error('Client not found');
    }
    return client;
  };

  getClientIndexBySocket = (socket: WebSocket) => {
    return this.clients.findIndex((client) => client.socket === socket);
  };

  removeClient = (client: Client) => {
    const index = this.clients.indexOf(client);
    if (index === -1) {
      return;
    }
    this.clients[index].channels.forEach((channel) => {
      try {
        channel.part(client);
      } catch (e) {
        console.error(e);
      }
    });
    this.clients.splice(index, 1);
    this.log.info(
      `Client disconnected: ${client.userId}, ${this.clients.length}`,
    );
  };

  addChannel = (id: string, name: string, channelId: string) => {
    this.channels.push(new ChatChannel(id, name, channelId));
    this.log.info(
      `Channel created: (id: ${id}, name: ${name}, channelId: ${channelId})`,
    );
  };

  getChannelById = (id: string) => {
    const channel = this.channels.find((channel) => channel.id === id);
    if (!channel) {
      throw new Error(`Channel '${id}' not found`);
    }
    return channel;
  };

  removeChannel = (id: string) => {
    const index = this.channels.findIndex((channel) => channel.id === id);
    if (index === -1) {
      return;
    }
    this.channels[index].stopWatching();
    this.channels.splice(index, 1);
  };

  checkClientLogined = (client: Client) => {
    if (client.userId === '') {
      throw new Error('Client not logined');
    }
    return client.userId;
  };

  onMessage = (socket: WebSocket, message: RawData) => {
    try {
      const msg = JSON.parse(message.toString()) as Chat;
      switch (msg.type) {
        case ChatType.PING:
          this.onPing(socket, msg);
          break;
        case ChatType.LOGIN:
          this.onLogin(socket, msg);
          break;
        case ChatType.JOIN:
          this.onJoin(socket, msg);
          break;
        case ChatType.PART:
          this.onPart(socket, msg);
          break;
        case ChatType.CHLIST:
          this.onChannelList(socket, msg);
          break;
        default:
          throw new Error('Unknown message type');
      }
    } catch (e) {
      console.error(e);
      this.log.warn(`Invalid message: ${JSON.stringify(e)}`);
    }
  };

  onPing = (socket: WebSocket, msg: Chat) => {
    const client = this.getClientBySocket(socket);
    if (!client) {
      return;
    }
    client.lastPing = Date.now();

    client.send(ChatType.PING);
  };

  onLogin = (socket: WebSocket, msg: ChatLoginRequest) => {
    const client = this.getClientBySocket(socket);
    client.userId = '' + msg.body.userId;
    // TODO: check user id

    client.send(
      ChatType.LOGIN,
      {
        userId: client.userId,
      },
      true,
    );
    this.log.info(`Client logined: ${client.userId}`);
  };

  onJoin = (socket: WebSocket, msg: ChatJoinRequest) => {
    const client = this.getClientBySocket(socket);
    const userId = this.checkClientLogined(client);

    const { channelIds } = msg.body;
    const joinedChannelIds: string[] = [];
    for (const channelId of channelIds) {
      try {
        const channel = this.getChannelById(channelId);
        channel.join(client);
        joinedChannelIds.push(channelId);
      } catch (e) {
        console.error(e);
      }
    }

    client.send(
      ChatType.JOIN,
      {
        userId,
        channelIds: joinedChannelIds,
      },
      true,
    );
  };

  onPart = (socket: WebSocket, msg: ChatPartRequest) => {
    const client = this.getClientBySocket(socket);
    const userId = this.checkClientLogined(client);

    const { channelIds } = msg.body;
    const partedChannelIds: string[] = [];
    for (const channelId of channelIds) {
      try {
        const channel = this.getChannelById(channelId);
        channel.part(client);
        partedChannelIds.push(channelId);
      } catch (e) {
        console.error(e);
      }
    }

    client.send(
      ChatType.PART,
      {
        userId,
        channelIds: partedChannelIds,
      },
      true,
    );
  };

  onChannelList = (socket: WebSocket, msg: Chat) => {
    const client = this.getClientBySocket(socket);
    const userId = this.checkClientLogined(client);

    client.send(
      ChatType.CHLIST,
      {
        userId,
        channelIds: this.channels.map((channel) => channel.id),
      },
      true,
    );
    this.log.verbose(`Called channel list by ${client.userId}`);
  };
}

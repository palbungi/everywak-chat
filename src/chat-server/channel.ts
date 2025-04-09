import {
  ConnectedState,
  SoopChatClient,
  SoopChatMessage,
} from 'soop-chat-client';
import { Client } from './client.js';
import { Logger } from '../utils/logger.js';
import {
  Chat,
  ChatDonationResponse,
  ChatDonationType,
  ChatPrivateMessageResponse,
  ChatType,
  ChatUserMessage,
  ChatUserProfileBadge,
  ChatUserSticker,
} from './types.chat.js';
import {
  FanBadge,
  ManagerBadge,
  StreamerBadge,
  TopfanBadge,
} from './constants/badges.js';

export class ChatChannel {
  id: string;
  name: string;
  channelId: string;

  log: Logger;
  chatClient: SoopChatClient;

  watchingInterval = 5000;
  watchingLoop?: NodeJS.Timeout;

  clients: Client[] = [];

  constructor(id: string, name: string, channelId: string) {
    this.id = id;
    this.name = name;
    this.channelId = channelId;
    this.chatClient = new SoopChatClient({ logging: true });
    this.log = new Logger(`everywak-chat:${id}`, true);
    this.initEvents();

    this.startWatching();
  }

  startWatching = () => {
    if (this.watchingLoop) {
      clearInterval(this.watchingLoop);
    }
    const connect = () => {
      if (this.chatClient.connectedState === ConnectedState.STANDBY) {
        this.chatClient.connect(this.channelId);
      }
    };
    connect();
    this.watchingLoop = setInterval(connect, this.watchingInterval);
  };

  stopWatching = () => {
    if (this.watchingLoop) {
      clearInterval(this.watchingLoop);
    }
    this.chatClient.close();
  };

  join = (client: Client) => {
    if (this.clients.includes(client)) {
      throw new Error(
        `Client '${client.userId}' already joined in '${this.id}'`,
      );
    }
    this.clients.push(client);
    client.channels.push(this);
    this.log.info(`Client joined: ${client.userId} in ${this.id}`);
  };

  part = (client: Client) => {
    const index = this.clients.indexOf(client);
    if (index === -1) {
      throw new Error(`Client '${client.userId}' not joined in '${this.id}'`);
    }
    this.clients.splice(index, 1);
    const channelIndex = client.channels.indexOf(this);
    if (channelIndex === -1) {
      throw new Error(`Client '${client.userId}' not joined in '${this.id}'`);
    }
    client.channels.splice(channelIndex, 1);
    this.log.info(`Client parted: ${client.userId} from ${this.id}`);
  };

  broadcast = (msg: Chat) => {
    const str = JSON.stringify(msg);
    this.clients.forEach((client) => {
      client.socket.send(str);
    });
  };

  initEvents = () => {
    this.chatClient.on('chat', this.onChat);
    this.chatClient.on('balloon', this.onDonation);
  };

  onChat = (message: SoopChatMessage) => {
    const badges: ChatUserProfileBadge[] = [];
    if (message.subscription > 0) {
      badges.push({
        name: `sub/${message.subscription}`,
        imgUrl:
          this.chatClient.stream?.CHANNEL.PCON_OBJECT?.tier1.findLast(
            (badge) => badge.MONTH <= message.subscription,
          )?.FILENAME || '',
      });
    }
    if (message.isStreamer) {
      badges.push(StreamerBadge);
    } else if (message.isManager) {
      badges.push(ManagerBadge);
    } else if (message.isTopfan) {
      badges.push(TopfanBadge);
    } else if (message.isFan) {
      badges.push(FanBadge);
    }
    const contents: ChatUserMessage[] = message.parsedContent.map((content) => {
      if (content.type === 0) {
        return {
          type: 'text',
          text: content.body,
        };
      } else {
        return {
          type: 'emote',
          name: content.body,
          imgUrl: message.emotes[content.body].mobileImg,
        };
      }
    });
    const msg: ChatPrivateMessageResponse = {
      type: ChatType.PRIVMSG,
      channelId: this.id,
      body: {
        profile: {
          userId: message.userId,
          nickname: message.nickname,
          color: message.color,
          colorDarkmode: message.colorDarkmode,
          badges,
        },
        message: [
          ...contents,
          ...(message.stickerUrl
            ? [
                {
                  type: 'sticker',
                  name: '',
                  imgUrl: `https://ogq-sticker-global-cdn-z01.sooplive.co.kr/sticker/${message.stickerUrl}`,
                } as ChatUserSticker,
              ]
            : []),
        ],
        timestamp: Date.now(),
      },
    };
    this.broadcast(msg);
  };

  onDonation = (message: {
    type: unknown;
    userId: any;
    nickname: any;
    count: any;
    fanClubOrder: any;
    imageName: any;
  }) => {
    const msg: ChatDonationResponse = {
      type: ChatType.DONATION,
      channelId: this.id,
      body: {
        type: message.type as unknown as ChatDonationType,
        profile: {
          userId: message.userId,
          nickname: message.nickname,
          color: '',
          colorDarkmode: '',
          badges: [],
        },
        message: '',
        count: message.count,
        fanJoinOrder: message.fanClubOrder,
        imgUrl: message.imageName,
        timestamp: Date.now(),
      },
    };
    this.broadcast(msg);
  };
}

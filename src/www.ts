// import express from 'express';
import { ChatServer } from './chat-server/chat-server.js';

// const app = express();
// const port = 3000;

const chatServer = new ChatServer(3000);

(async () => {
  const res = await fetch(`${process.env.API_URL}/member/list`);
  if (res.ok) {
    const data = (await res.json()) as any[];
    const channels: { id: string; name: string; channelId: string }[] = [];
    data.forEach((member: any) => {
      const channel = member.livePlatform.find(
        (platform: any) => platform.type === 'afreeca',
      );
      if (channel) {
        channels.push({
          id: member.id,
          name: member.name,
          channelId: channel.channelId,
        });
      }
    });
    channels.forEach((channel) => {
      chatServer.addChannel(channel.id, channel.name, channel.channelId);
    });
  }
})();

// app.use('/', express.static(path.join(path.resolve(), 'public')));

// app.listen(port, () => {
//   console.log(`Server running at http://localhost:${port}`);
// });

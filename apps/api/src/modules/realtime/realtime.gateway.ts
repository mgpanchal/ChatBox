import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { TokenService } from '../auth/token.service';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from './presence.service';

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  pingInterval: 15_000,
  pingTimeout: 10_000,
  connectTimeout: 10_000,
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
  ) {}

  async handleConnection(socket: Socket) {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) throw new Error('No token');
      if (typeof token !== 'string' || token.length < 20 || token.length > 4000) throw new Error('Bad token');
      const claims = this.tokens.verifyAccess(token);
      const userId = claims.sub;
      socket.data.userId = userId;

      socket.join(`user:${userId}`);

      const memberships = await this.prisma.conversationMember.findMany({
        where: { userId },
        select: { conversationId: true },
      });
      const convoIds = memberships.map((m) => m.conversationId);
      for (const cid of convoIds) socket.join(`conversation:${cid}`);
      this.presence.setConversations(userId, convoIds);

      const wasOffline = this.presence.online(userId, socket.id);
      if (wasOffline) {
        for (const cid of convoIds) {
          socket.to(`conversation:${cid}`).emit('presence', { userId, online: true });
        }
      }
    } catch (e) {
      this.logger.warn(`socket auth failed: ${(e as Error).message}`);
      socket.disconnect();
    }
  }

  async handleDisconnect(socket: Socket) {
    const userId = socket.data.userId as string | undefined;
    if (!userId) return;
    const fullyOffline = this.presence.offline(userId, socket.id);
    if (fullyOffline) {
      const lastSeenAt = new Date();
      await this.prisma.user.update({ where: { id: userId }, data: { lastSeenAt } }).catch(() => {});
      const convoIds = this.presence.getConversations(userId);
      for (const cid of convoIds) {
        this.server.to(`conversation:${cid}`).emit('presence', { userId, online: false, lastSeenAt: lastSeenAt.toISOString() });
      }
    }
  }

  @SubscribeMessage('presence:list')
  presenceList(@ConnectedSocket() socket: Socket, @MessageBody() data: { userIds: string[] }) {
    const list = (data?.userIds ?? []).map((id) => ({ userId: id, online: this.presence.isOnline(id) }));
    socket.emit('presence:bulk', list);
  }

  @SubscribeMessage('message:delivered')
  async onDelivered(@ConnectedSocket() socket: Socket, @MessageBody() data: { messageId: string }) {
    const userId = socket.data.userId as string;
    if (!userId || !data?.messageId) return;
    const r = await this.prisma.messageReceipt
      .update({
        where: { messageId_userId: { messageId: data.messageId, userId } },
        data: { deliveredAt: new Date() },
        include: { message: { select: { senderId: true, conversationId: true } } },
      })
      .catch(() => null);
    if (!r) return;
    this.server.to(`user:${r.message.senderId}`).emit('message:receipt', {
      messageId: r.messageId,
      conversationId: r.message.conversationId,
      userId,
      deliveredAt: r.deliveredAt?.toISOString() ?? null,
      readAt: r.readAt?.toISOString() ?? null,
    });
  }

  @SubscribeMessage('conversation:read')
  async onRead(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { conversationId: string; upToMessageId: string },
  ) {
    const userId = socket.data.userId as string;
    if (!userId || !data?.conversationId || !data?.upToMessageId) return;

    const upTo = await this.prisma.message.findUnique({
      where: { id: data.upToMessageId },
      select: { createdAt: true },
    });
    if (!upTo) return;

    const toMark = await this.prisma.messageReceipt.findMany({
      where: {
        userId,
        readAt: null,
        message: {
          conversationId: data.conversationId,
          createdAt: { lte: upTo.createdAt },
          senderId: { not: userId },
        },
      },
      include: { message: { select: { senderId: true, conversationId: true } } },
    });
    if (!toMark.length) return;

    const now = new Date();
    await this.prisma.messageReceipt.updateMany({
      where: { id: { in: toMark.map((r) => r.id) } },
      data: { readAt: now, deliveredAt: now },
    });

    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId: data.conversationId, userId } },
      data: { lastReadAt: now },
    }).catch(() => {});

    for (const r of toMark) {
      this.server.to(`user:${r.message.senderId}`).emit('message:receipt', {
        messageId: r.messageId,
        conversationId: r.message.conversationId,
        userId,
        deliveredAt: now.toISOString(),
        readAt: now.toISOString(),
      });
    }
  }

  @SubscribeMessage('typing')
  onTyping(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { conversationId: string; typing: boolean },
  ) {
    const userId = socket.data.userId as string;
    if (!userId || !data?.conversationId) return;
    socket.to(`conversation:${data.conversationId}`).emit('typing', {
      conversationId: data.conversationId,
      userId,
      typing: !!data.typing,
    });
  }

  broadcastNewMessage(conversationId: string, message: any, excludeUserId?: string) {
    this.broadcastToRoom(conversationId, 'message:new', { conversationId, message }, excludeUserId);
  }

  broadcastSplitMessage(
    conversationId: string,
    fullMessage: any,
    redactedMessage: any,
    audienceUserIds: Set<string>,
    excludeUserId?: string,
  ) {
    const room = `conversation:${conversationId}`;
    const sockets = this.server.sockets.adapter.rooms.get(room);
    if (!sockets) return;
    for (const sid of sockets) {
      const s = this.server.sockets.sockets.get(sid);
      if (!s) continue;
      const uid = s.data.userId as string | undefined;
      if (!uid || uid === excludeUserId) continue;
      const payload = audienceUserIds.has(uid) ? fullMessage : redactedMessage;
      s.emit('message:new', { conversationId, message: payload });
    }
  }

  broadcastToRoom(conversationId: string, event: string, payload: any, excludeUserId?: string) {
    const room = `conversation:${conversationId}`;
    if (excludeUserId) {
      const sockets = this.server.sockets.adapter.rooms.get(room);
      if (sockets) {
        for (const sid of sockets) {
          const s = this.server.sockets.sockets.get(sid);
          if (s && s.data.userId !== excludeUserId) s.emit(event, payload);
        }
      }
    } else {
      this.server.to(room).emit(event, payload);
    }
  }

  emitToUser(userId: string, event: string, payload: any) {
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  joinUserToConversation(userId: string, conversationId: string) {
    const userRoom = `user:${userId}`;
    const sockets = this.server.sockets.adapter.rooms.get(userRoom);
    if (!sockets) return;
    for (const sid of sockets) {
      const s = this.server.sockets.sockets.get(sid);
      if (s) s.join(`conversation:${conversationId}`);
    }
    const list = this.presence.getConversations(userId);
    if (!list.includes(conversationId)) {
      this.presence.setConversations(userId, [...list, conversationId]);
    }
  }
}

import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PresenceService } from '../realtime/presence.service';
import { StorageService } from '../storage/storage.service';
import { signAvatarVariants } from '../users/photo.controller';
import { scanForDlp } from './dlp';

type FormattedAttachment = {
  id: string;
  kind: 'image' | 'video' | 'audio' | 'file';
  fileName: string;
  contentType: string;
  size: number;
  url: string;
  previewUrl: string | null;
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
};

type FormattedMessage = {
  id: string;
  body: string | null;
  deleted: boolean;
  sender: { id: string; displayName: string; employeeId: string | null; photoUrls: { thumb: string; sm: string; md: string; lg: string } | null };
  self: boolean;
  replyToMessageId: string | null;
  replyToPreview: { senderName: string; body: string | null; deleted: boolean } | null;
  editedAt: string | null;
  createdAt: string;
  reactions: { emoji: string; userId: string }[];
  receipts: { userId: string; deliveredAt: string | null; readAt: string | null }[];
  mentions: { userId: string }[];
  attachments: FormattedAttachment[];
  visibility: 'everyone' | 'restricted';
  audienceTeams: { slug: string; name: string }[];
  redacted: boolean;
};

const EDIT_WINDOW_MIN = 15;
const SYSTEM_TEAM_SLUGS = ['admin', 'auditor'];

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseMentions(body: string, members: { userId: string; displayName: string }[]): string[] {
  const mentioned = new Set<string>();
  for (const m of members) {
    if (!m.displayName) continue;
    const full = escapeRegex(m.displayName);
    const first = escapeRegex(m.displayName.split(/\s+/)[0] ?? '');
    const fullRe = new RegExp(`@${full}\\b`, 'i');
    const firstRe = new RegExp(`@${first}\\b`, 'i');
    if (fullRe.test(body) || firstRe.test(body)) mentioned.add(m.userId);
  }
  return [...mentioned];
}

function parseTeamMentions(body: string, teams: { id: string; slug: string; name: string }[]): string[] {
  const mentioned = new Set<string>();
  for (const t of teams) {
    const name = escapeRegex(t.name);
    const slug = escapeRegex(t.slug);
    const re = new RegExp(`@(${name}|${slug})\\b`, 'i');
    if (re.test(body)) mentioned.add(t.id);
  }
  return [...mentioned];
}

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly presence: PresenceService,
    private readonly storage: StorageService,
  ) {}

  private async signAttachments(atts: any[]): Promise<FormattedAttachment[]> {
    return Promise.all(
      (atts ?? []).map(async (a) => {
        const url = await this.storage.signedDownloadUrl(a.storageKey, a.fileName);
        let previewUrl: string | null = null;
        let thumbUrl: string | null = null;
        if (a.kind === 'image') {
          previewUrl = await this.storage.signedDownloadUrl(`${a.storageKey}.preview.webp`).catch(() => url);
          thumbUrl = await this.storage.signedDownloadUrl(`${a.storageKey}.thumb.webp`).catch(() => url);
        }
        return {
          id: a.id,
          kind: a.kind,
          fileName: a.fileName,
          contentType: a.contentType,
          size: a.size,
          width: a.width,
          height: a.height,
          url,
          previewUrl,
          thumbUrl,
        };
      }),
    );
  }

  async listForUser(userId: string) {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId },
      include: {
        conversation: {
          include: {
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: { sender: { include: { profile: true } } },
            },
          },
        },
      },
    });

    const items = await Promise.all(
      memberships.map(async (m) => {
        const c = m.conversation;
        const last = c.messages[0];
        const unread = await this.prisma.message.count({
          where: {
            conversationId: c.id,
            senderId: { not: userId },
            createdAt: m.lastReadAt ? { gt: m.lastReadAt } : undefined,
            deletedAt: null,
          },
        });

        let title = c.title;
        let otherUserId: string | null = null;
        let otherPhotoUrls: any = null;
        if (c.kind === 'direct' && !title) {
          const other = await this.prisma.conversationMember.findFirst({
            where: { conversationId: c.id, userId: { not: userId } },
            include: { user: { include: { profile: true } } },
          });
          title = other?.user.profile?.displayName ?? 'Direct message';
          otherUserId = other?.userId ?? null;
          otherPhotoUrls = await signAvatarVariants(this.storage, other?.user.profile?.photoStorageKey);
        }

        const muted = m.mutedUntil ? m.mutedUntil.getTime() > Date.now() : false;
        return {
          id: c.id,
          kind: c.kind,
          title,
          sensitivity: c.sensitivity,
          pinned: c.pinned,
          muted,
          mutedUntil: m.mutedUntil?.toISOString() ?? null,
          lastMessage: last
            ? {
                id: last.id,
                body: last.body,
                createdAt: last.createdAt.toISOString(),
                senderName: last.sender.profile?.displayName ?? 'Unknown',
                self: last.senderId === userId,
              }
            : null,
          unread,
          otherUserId,
          otherOnline: otherUserId ? this.presence.isOnline(otherUserId) : null,
          otherPhotoUrls,
          updatedAt: c.updatedAt.toISOString(),
        };
      }),
    );

    return items.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const at = a.lastMessage?.createdAt ?? a.updatedAt;
      const bt = b.lastMessage?.createdAt ?? b.updatedAt;
      return bt.localeCompare(at);
    });
  }

  async getDetail(userId: string, conversationId: string) {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) throw new ForbiddenException('Not a member of this conversation');

    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: { include: { user: { include: { profile: true } } } },
      },
    });
    if (!conv) throw new NotFoundException();

    let title = conv.title;
    if (conv.kind === 'direct' && !title) {
      const other = conv.members.find((m) => m.userId !== userId);
      title = other?.user.profile?.displayName ?? 'Direct message';
    }

    return {
      id: conv.id,
      kind: conv.kind,
      title,
      topic: conv.topic,
      sensitivity: conv.sensitivity,
      pinned: conv.pinned,
      members: await Promise.all(conv.members.map(async (m) => ({
        userId: m.userId,
        displayName: m.user.profile?.displayName ?? 'Unknown',
        employeeId: m.user.profile?.employeeId,
        isAdmin: m.isAdmin,
        photoUrls: await signAvatarVariants(this.storage, m.user.profile?.photoStorageKey),
        online: this.presence.isOnline(m.userId),
        lastSeenAt: m.user.lastSeenAt?.toISOString() ?? null,
      }))),
    };
  }

  async listMessages(
    userId: string,
    conversationId: string,
    options: { before?: string; around?: string; limit?: number } = {},
  ): Promise<{ messages: FormattedMessage[]; hasMore: boolean }> {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) throw new ForbiddenException();

    const viewerIsAdmin = await this.isAdmin(userId);
    const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
    const include = {
      sender: { include: { profile: true } as const },
      reactions: true as const,
      receipts: true as const,
      mentions: true as const,
      attachments: true as const,
      audienceUsers: { select: { userId: true } } as const,
      audienceTeams: { include: { team: true } as const } as const,
      replyTo: { include: { sender: { include: { profile: true } as const } as const } as const } as const,
    };

    let rows: any[];
    let hasMore: boolean;

    if (options.around) {
      const anchor = await this.prisma.message.findUnique({
        where: { id: options.around },
        select: { createdAt: true, conversationId: true },
      });
      if (!anchor || anchor.conversationId !== conversationId) {
        throw new NotFoundException('Anchor message not in this conversation');
      }
      const halfPlusOne = Math.ceil(limit / 2) + 1;
      const before = await this.prisma.message.findMany({
        where: { conversationId, createdAt: { lte: anchor.createdAt } },
        orderBy: { createdAt: 'desc' },
        take: halfPlusOne,
        include,
      });
      const after = await this.prisma.message.findMany({
        where: { conversationId, createdAt: { gt: anchor.createdAt } },
        orderBy: { createdAt: 'asc' },
        take: Math.floor(limit / 2),
        include,
      });
      rows = [...before.reverse(), ...after];
      hasMore = before.length >= halfPlusOne;
      if (rows.length > limit) rows = rows.slice(rows.length - limit);
    } else if (options.before) {
      const beforeDate = new Date(options.before);
      const fetched = await this.prisma.message.findMany({
        where: { conversationId, createdAt: { lt: beforeDate } },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        include,
      });
      hasMore = fetched.length > limit;
      rows = (hasMore ? fetched.slice(0, limit) : fetched).reverse();
    } else {
      const fetched = await this.prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        include,
      });
      hasMore = fetched.length > limit;
      rows = (hasMore ? fetched.slice(0, limit) : fetched).reverse();
    }

    const messages = await Promise.all(rows.map((m) => this.formatMessage(m, userId, viewerIsAdmin)));
    return { messages, hasMore };
  }

  private async isAdmin(userId: string): Promise<boolean> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
    return !!u?.isAdmin;
  }

  private isInAudience(m: any, viewerId: string, viewerIsAdmin: boolean): boolean {
    if (m.visibility !== 'restricted') return true;
    if (m.senderId === viewerId) return true;
    if (viewerIsAdmin) return true;
    return (m.audienceUsers ?? []).some((a: any) => a.userId === viewerId);
  }

  private async formatMessage(m: any, viewerId: string, viewerIsAdmin = false): Promise<FormattedMessage> {
    const inAudience = this.isInAudience(m, viewerId, viewerIsAdmin);
    const audienceTeams = (m.audienceTeams ?? []).map((at: any) => ({ slug: at.team.slug, name: at.team.name }));
    const senderPhotoUrls = await signAvatarVariants(this.storage, m.sender?.profile?.photoStorageKey);
    const senderInfo = {
      id: m.senderId,
      displayName: m.sender?.profile?.displayName ?? 'Unknown',
      employeeId: m.sender?.profile?.employeeId ?? null,
      photoUrls: senderPhotoUrls,
    };
    const visibility: 'everyone' | 'restricted' = m.visibility === 'restricted' ? 'restricted' : 'everyone';

    if (!inAudience) {
      return {
        id: m.id,
        body: null,
        deleted: !!m.deletedAt,
        sender: senderInfo,
        self: false,
        replyToMessageId: null,
        replyToPreview: null,
        editedAt: null,
        createdAt: m.createdAt.toISOString(),
        reactions: [],
        receipts: [],
        mentions: [],
        attachments: [],
        visibility,
        audienceTeams,
        redacted: true,
      };
    }

    let replyToPreview = null as FormattedMessage['replyToPreview'];
    if (m.replyTo) {
      replyToPreview = {
        senderName: m.replyTo.sender?.profile?.displayName ?? 'Unknown',
        body: m.replyTo.deletedAt ? null : (m.replyTo.body as string).slice(0, 200),
        deleted: !!m.replyTo.deletedAt,
      };
    }
    const attachments = await this.signAttachments(m.attachments ?? []);
    return {
      id: m.id,
      body: m.deletedAt ? null : m.body,
      deleted: !!m.deletedAt,
      sender: senderInfo,
      self: m.senderId === viewerId,
      replyToMessageId: m.replyToMessageId ?? null,
      replyToPreview,
      editedAt: m.editedAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
      reactions: (m.reactions ?? []).map((r: any) => ({ emoji: r.emoji, userId: r.userId })),
      receipts: (m.receipts ?? []).map((r: any) => ({
        userId: r.userId,
        deliveredAt: r.deliveredAt?.toISOString() ?? null,
        readAt: r.readAt?.toISOString() ?? null,
      })),
      mentions: (m.mentions ?? []).map((x: any) => ({ userId: x.userId })),
      attachments,
      visibility,
      audienceTeams,
      redacted: false,
    };
  }

  async findOrCreateDirect(userId: string, otherUserId: string) {
    if (userId === otherUserId) throw new ForbiddenException('Cannot DM yourself');
    const other = await this.prisma.user.findUnique({ where: { id: otherUserId, status: 'active' } });
    if (!other) throw new NotFoundException('User not found');

    const existing = await this.prisma.conversation.findFirst({
      where: {
        kind: 'direct',
        AND: [
          { members: { some: { userId } } },
          { members: { some: { userId: otherUserId } } },
        ],
      },
    });
    if (existing) return { id: existing.id, kind: existing.kind };

    const conv = await this.prisma.conversation.create({
      data: {
        kind: 'direct',
        sensitivity: 'internal',
        members: {
          create: [
            { userId, isAdmin: false },
            { userId: otherUserId, isAdmin: false },
          ],
        },
      },
    });
    this.realtime.joinUserToConversation(userId, conv.id);
    this.realtime.joinUserToConversation(otherUserId, conv.id);
    this.realtime.emitToUser(userId, 'conversation:created', { conversationId: conv.id });
    this.realtime.emitToUser(otherUserId, 'conversation:created', { conversationId: conv.id });
    return { id: conv.id, kind: conv.kind };
  }

  async sendMessage(userId: string, conversationId: string, body: string, replyToMessageId?: string, attachmentIds: string[] = []) {
    const trimmed = body.trim();
    const hasAtt = attachmentIds.length > 0;
    if (!trimmed && !hasAtt) throw new ForbiddenException('Empty message');

    const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId }, select: { kind: true } });
    if (!conv) throw new NotFoundException();
    const isDirect = conv.kind === 'direct';

    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId },
      include: { user: { include: { profile: true } } },
    });
    if (!members.some((m) => m.userId === userId)) throw new ForbiddenException();
    const recipients = members.filter((m) => m.userId !== userId);

    const memberDirectory = members
      .filter((m) => m.userId !== userId)
      .map((m) => ({ userId: m.userId, displayName: m.user.profile?.displayName ?? '' }));
    const mentionedIds = isDirect ? [] : parseMentions(trimmed, memberDirectory);

    const allTeams = isDirect ? [] : await this.prisma.team.findMany();
    const mentionedTeamIds = isDirect ? [] : parseTeamMentions(trimmed, allTeams);
    const isRestricted = mentionedTeamIds.length > 0;
    const dlpHits = scanForDlp(trimmed);

    let audienceUserIds: string[] = [];
    if (isRestricted) {
      const memberSet = new Set(members.map((m) => m.userId));
      const audience = new Set<string>([userId, ...mentionedIds]);

      const systemTeams = allTeams.filter((t) => SYSTEM_TEAM_SLUGS.includes(t.slug));
      const allRelevantTeamIds = [...mentionedTeamIds, ...systemTeams.map((t) => t.id)];
      const teamMembers = await this.prisma.teamMember.findMany({
        where: { teamId: { in: allRelevantTeamIds } },
        select: { userId: true },
      });
      for (const tm of teamMembers) {
        if (memberSet.has(tm.userId)) audience.add(tm.userId);
      }
      audienceUserIds = [...audience];
    }

    if (hasAtt) {
      const owned = await this.prisma.attachment.findMany({
        where: { id: { in: attachmentIds }, uploadedById: userId, messageId: null },
        select: { id: true },
      });
      if (owned.length !== attachmentIds.length) throw new ForbiddenException('Invalid attachments');
    }

    const msg = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        body: trimmed,
        replyToMessageId: replyToMessageId ?? null,
        visibility: isRestricted ? 'restricted' : 'everyone',
        flaggedReasons: dlpHits.length > 0 ? (dlpHits as any) : undefined,
        receipts: { create: recipients.map((r) => ({ userId: r.userId })) },
        mentions: { create: mentionedIds.map((uid) => ({ userId: uid })) },
        audienceUsers: isRestricted ? { create: audienceUserIds.map((uid) => ({ userId: uid })) } : undefined,
        audienceTeams: isRestricted ? { create: mentionedTeamIds.map((tid) => ({ teamId: tid })) } : undefined,
      },
      include: {
        sender: { include: { profile: true } },
        receipts: true,
        reactions: true,
        mentions: true,
        replyTo: { include: { sender: { include: { profile: true } } } },
      },
    });

    if (hasAtt) {
      await this.prisma.attachment.updateMany({
        where: { id: { in: attachmentIds }, uploadedById: userId, messageId: null },
        data: { messageId: msg.id },
      });
    }
    const finalMsg = await this.prisma.message.findUnique({
      where: { id: msg.id },
      include: {
        sender: { include: { profile: true } },
        receipts: true,
        reactions: true,
        mentions: true,
        attachments: true,
        audienceUsers: { select: { userId: true } },
        audienceTeams: { include: { team: true } },
        replyTo: { include: { sender: { include: { profile: true } } } },
      },
    });

    for (const uid of mentionedIds) {
      this.realtime.emitToUser(uid, 'mention', {
        conversationId,
        messageId: msg.id,
        from: { id: userId },
      });
    }

    if (dlpHits.length > 0) {
      await this.prisma.auditLog.create({
        data: {
          userId,
          action: 'dlp.flagged',
          targetType: 'message',
          targetId: msg.id,
          metadata: { reasons: dlpHits, conversationId } as any,
        },
      });
    }

    const formatted = await this.formatMessage(finalMsg ?? msg, userId, true);

    if (isRestricted) {
      const audienceSet = new Set(audienceUserIds);
      const fullPayload = await this.formatMessage(finalMsg ?? msg, '__viewer__', true);
      const redactedPayload = await this.formatMessage(finalMsg ?? msg, '__redacted__', false);
      this.realtime.broadcastSplitMessage(conversationId, fullPayload, redactedPayload, audienceSet, userId);
    } else {
      const broadcast = await this.formatMessage(finalMsg ?? msg, '__broadcast__', false);
      this.realtime.broadcastNewMessage(conversationId, broadcast, userId);
    }

    return formatted;
  }

  private async assertMember(userId: string, conversationId: string) {
    const m = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!m) throw new ForbiddenException();
  }

  async toggleReaction(userId: string, conversationId: string, messageId: string, emoji: string) {
    if (!emoji || emoji.length > 16) throw new ForbiddenException('Invalid emoji');
    await this.assertMember(userId, conversationId);

    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { conversationId: true, deletedAt: true },
    });
    if (!msg || msg.conversationId !== conversationId) throw new NotFoundException();
    if (msg.deletedAt) throw new ForbiddenException('Message is deleted');

    const existing = await this.prisma.messageReaction.findFirst({
      where: { messageId, userId, emoji },
    });

    let action: 'added' | 'removed';
    if (existing) {
      await this.prisma.messageReaction.delete({ where: { id: existing.id } });
      action = 'removed';
    } else {
      await this.prisma.messageReaction.create({ data: { messageId, userId, emoji } });
      action = 'added';
    }

    this.realtime.broadcastToRoom(conversationId, 'message:reaction', {
      conversationId,
      messageId,
      userId,
      emoji,
      action,
    });
    return { ok: true, action };
  }

  async editMessage(userId: string, conversationId: string, messageId: string, newBody: string) {
    const trimmed = newBody.trim();
    if (!trimmed) throw new ForbiddenException('Empty message');
    await this.assertMember(userId, conversationId);

    const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!msg || msg.conversationId !== conversationId) throw new NotFoundException();
    if (msg.senderId !== userId) throw new ForbiddenException('Cannot edit others\' messages');
    if (msg.deletedAt) throw new ForbiddenException('Message is deleted');
    const ageMin = (Date.now() - msg.createdAt.getTime()) / 60000;
    if (ageMin > EDIT_WINDOW_MIN) throw new ForbiddenException(`Edit window of ${EDIT_WINDOW_MIN} min has passed`);

    const editedAt = new Date();
    await this.prisma.message.update({
      where: { id: messageId },
      data: { body: trimmed, editedAt },
    });

    this.realtime.broadcastToRoom(conversationId, 'message:edited', {
      conversationId,
      messageId,
      body: trimmed,
      editedAt: editedAt.toISOString(),
    });
    return { ok: true, body: trimmed, editedAt: editedAt.toISOString() };
  }

  async search(
    userId: string,
    conversationId: string | null,
    query: string,
    options: { before?: string; limit?: number } = {},
  ) {
    const q = query.trim();
    if (q.length < 2) return { results: [], nextCursor: null as string | null };

    const limit = Math.max(1, Math.min(options.limit ?? 30, 50));

    // GIN-indexed full-text search via Postgres tsvector. ~100-1000x faster than ILIKE on large tables.
    type Row = {
      id: string;
      body: string;
      createdAt: Date;
      senderId: string;
      conversationId: string;
      senderName: string | null;
      senderPhotoKey: string | null;
      conversationTitle: string | null;
      conversationKind: string;
      conversationSensitivity: string;
    };
    const convoFilter = conversationId
      ? Prisma.sql`AND m."conversationId" = ${conversationId}::uuid`
      : Prisma.empty;
    const beforeFilter = options.before
      ? Prisma.sql`AND m."createdAt" < ${new Date(options.before)}`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT m.id, m.body, m."createdAt", m."senderId", m."conversationId",
             p."displayName" AS "senderName",
             p."photoStorageKey" AS "senderPhotoKey",
             c.title AS "conversationTitle",
             c.kind::text AS "conversationKind",
             c.sensitivity::text AS "conversationSensitivity"
      FROM "Message" m
      LEFT JOIN "EmployeeProfile" p ON p."userId" = m."senderId"
      JOIN "Conversation" c ON c.id = m."conversationId"
      WHERE m."deletedAt" IS NULL
        AND to_tsvector('english', m.body) @@ websearch_to_tsquery('english', ${q})
        ${convoFilter}
        ${beforeFilter}
        AND m."conversationId" IN (
          SELECT "conversationId" FROM "ConversationMember" WHERE "userId" = ${userId}::uuid
        )
      ORDER BY m."createdAt" DESC
      LIMIT ${limit + 1}
    `);

    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? visible[visible.length - 1]!.createdAt.toISOString() : null;

    const results = await Promise.all(
      visible.map(async (r) => ({
        id: r.id,
        body: r.body,
        createdAt: r.createdAt.toISOString(),
        sender: {
          id: r.senderId,
          displayName: r.senderName ?? 'Unknown',
          photoUrls: await signAvatarVariants(this.storage, r.senderPhotoKey),
        },
        conversation: { id: r.conversationId, title: r.conversationTitle, kind: r.conversationKind, sensitivity: r.conversationSensitivity },
      })),
    );
    return { results, nextCursor };
  }

  async listMembers(userId: string, conversationId: string) {
    await this.assertMember(userId, conversationId);
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId },
      include: { user: { include: { profile: true } } },
    });
    return Promise.all(members.map(async (m) => ({
      userId: m.userId,
      displayName: m.user.profile?.displayName ?? 'Unknown',
      employeeId: m.user.profile?.employeeId ?? null,
      department: m.user.profile?.department ?? null,
      title: m.user.profile?.title ?? null,
      isAdmin: m.isAdmin,
      online: this.presence.isOnline(m.userId),
      lastSeenAt: m.user.lastSeenAt?.toISOString() ?? null,
      joinedAt: m.joinedAt.toISOString(),
      photoUrls: await signAvatarVariants(this.storage, m.user.profile?.photoStorageKey),
    })));
  }

  async setMute(userId: string, conversationId: string, mutedUntil: Date | null) {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) throw new ForbiddenException();
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { mutedUntil },
    });
    return { ok: true, mutedUntil: mutedUntil?.toISOString() ?? null };
  }

  async leave(userId: string, conversationId: string) {
    const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) throw new NotFoundException();
    if (conv.kind === 'direct') throw new ForbiddenException('Cannot leave a direct message');
    await this.prisma.conversationMember.deleteMany({
      where: { conversationId, userId },
    });
    this.realtime.emitToUser(userId, 'conversation:left', { conversationId });
    return { ok: true };
  }

  async addMembers(adminUserId: string, conversationId: string, userIds: string[]) {
    const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) throw new NotFoundException();

    const valid = await this.prisma.user.findMany({
      where: { id: { in: userIds }, status: 'active', deletedAt: null },
      select: { id: true },
    });
    const validIds = valid.map((u) => u.id);

    const existing = await this.prisma.conversationMember.findMany({
      where: { conversationId, userId: { in: validIds } },
      select: { userId: true },
    });
    const existingSet = new Set(existing.map((e) => e.userId));
    const toAdd = validIds.filter((id) => !existingSet.has(id));

    if (toAdd.length === 0) return { added: 0 };

    await this.prisma.conversationMember.createMany({
      data: toAdd.map((userId) => ({ conversationId, userId })),
    });

    for (const id of toAdd) {
      this.realtime.joinUserToConversation(id, conversationId);
      this.realtime.emitToUser(id, 'conversation:created', { conversationId });
    }
    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId,
        action: 'channel.members_added',
        targetType: 'conversation',
        targetId: conversationId,
        metadata: { count: toAdd.length },
      },
    });

    return { added: toAdd.length };
  }

  async removeMember(adminUserId: string, conversationId: string, userId: string) {
    await this.prisma.conversationMember.deleteMany({
      where: { conversationId, userId },
    });
    this.realtime.emitToUser(userId, 'conversation:left', { conversationId });
    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId,
        action: 'channel.member_removed',
        targetType: 'conversation',
        targetId: conversationId,
        metadata: { userId },
      },
    });
    return { ok: true };
  }

  async deleteMessage(userId: string, conversationId: string, messageId: string) {
    await this.assertMember(userId, conversationId);

    const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!msg || msg.conversationId !== conversationId) throw new NotFoundException();
    if (msg.senderId !== userId) throw new ForbiddenException('Cannot delete others\' messages');
    if (msg.deletedAt) return { ok: true };

    const deletedAt = new Date();
    await this.prisma.message.update({ where: { id: messageId }, data: { deletedAt } });

    this.realtime.broadcastToRoom(conversationId, 'message:deleted', {
      conversationId,
      messageId,
      deletedAt: deletedAt.toISOString(),
    });
    return { ok: true };
  }
}

import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import type { BulkInviteDto, CreateConversationDto, CreateInviteDto } from './admin.dto';

@Injectable()
export class AdminService {
  private readonly inviteTtlDays = Number(process.env.INVITE_TTL_DAYS ?? 7);

  constructor(private readonly prisma: PrismaService, private readonly realtime: RealtimeGateway) {}

  async stats() {
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);

    const [totalEmployees, pendingInvites, expiringSoon, messagesToday, confidentialChannels, deactivated] =
      await this.prisma.$transaction([
        this.prisma.user.count({ where: { status: 'active', deletedAt: null } }),
        this.prisma.invite.count({ where: { status: { in: ['pending', 'sent'] } } }),
        this.prisma.invite.count({
          where: {
            status: { in: ['pending', 'sent'] },
            expiresAt: { lt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) },
          },
        }),
        this.prisma.message.count({ where: { createdAt: { gte: dayStart }, deletedAt: null } }),
        this.prisma.conversation.count({ where: { sensitivity: { in: ['confidential', 'restricted'] } } }),
        this.prisma.user.count({ where: { status: 'deactivated' } }),
      ]);

    return {
      totalEmployees,
      pendingInvites,
      expiringSoon,
      messagesToday,
      confidentialChannels,
      deactivated,
    };
  }

  async listInvites() {
    const invites = await this.prisma.invite.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return invites.map((i) => ({
      id: i.id,
      mobileNumber: i.mobileNumber,
      employeeId: i.employeeId,
      displayName: i.displayName,
      department: i.department,
      status: i.status,
      expiresAt: i.expiresAt.toISOString(),
      acceptedAt: i.acceptedAt?.toISOString() ?? null,
      createdAt: i.createdAt.toISOString(),
    }));
  }

  async createInvite(adminUserId: string, body: CreateInviteDto) {
    const existing = await this.prisma.invite.findFirst({
      where: { mobileNumber: body.mobileNumber, status: { in: ['pending', 'sent'] }, expiresAt: { gt: new Date() } },
    });
    if (existing) throw new ConflictException('Active invite already exists for this number.');

    const userExists = await this.prisma.user.findUnique({ where: { mobileNumber: body.mobileNumber } });
    if (userExists && userExists.status === 'active') {
      throw new ConflictException('User already exists for this number.');
    }

    const inv = await this.prisma.invite.create({
      data: {
        mobileNumber: body.mobileNumber,
        employeeId: body.employeeId,
        displayName: body.displayName,
        department: body.department,
        status: 'sent',
        createdById: adminUserId,
        expiresAt: new Date(Date.now() + this.inviteTtlDays * 24 * 60 * 60 * 1000),
      },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId,
        action: 'invite.created',
        targetType: 'invite',
        targetId: inv.id,
        metadata: { mobileNumber: body.mobileNumber, employeeId: body.employeeId },
      },
    });
    return inv;
  }

  async revokeInvite(adminUserId: string, inviteId: string) {
    const inv = await this.prisma.invite.findUnique({ where: { id: inviteId } });
    if (!inv) throw new NotFoundException();
    await this.prisma.invite.update({
      where: { id: inviteId },
      data: { status: 'revoked', revokedAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: { userId: adminUserId, action: 'invite.revoked', targetType: 'invite', targetId: inviteId },
    });
    return { ok: true };
  }

  async listUsers() {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      include: { profile: true, devices: { where: { revokedAt: null } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return users.map((u) => ({
      id: u.id,
      mobileNumber: u.mobileNumber,
      status: u.status,
      isAdmin: u.isAdmin,
      lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
      activeDevices: u.devices.length,
      profile: u.profile
        ? {
            employeeId: u.profile.employeeId,
            displayName: u.profile.displayName,
            department: u.profile.department,
            title: u.profile.title,
          }
        : null,
    }));
  }

  async setUserStatus(adminUserId: string, userId: string, status: 'active' | 'deactivated') {
    if (adminUserId === userId && status === 'deactivated') {
      throw new ConflictException('You cannot deactivate yourself.');
    }
    const updated = await this.prisma.user.update({ where: { id: userId }, data: { status } });
    if (status === 'deactivated') {
      await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.prisma.device.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await this.prisma.auditLog.create({
      data: { userId: adminUserId, action: status === 'deactivated' ? 'user.deactivated' : 'user.reactivated', targetType: 'user', targetId: userId },
    });
    return { ok: true, status: updated.status };
  }

  async setUserAdmin(adminUserId: string, userId: string, isAdmin: boolean) {
    if (adminUserId === userId && !isAdmin) {
      throw new ConflictException('You cannot remove your own admin role.');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { isAdmin } });
    await this.prisma.auditLog.create({
      data: { userId: adminUserId, action: isAdmin ? 'user.admin_granted' : 'user.admin_revoked', targetType: 'user', targetId: userId },
    });
    return { ok: true };
  }

  async forceLogoutAll(adminUserId: string, targetUserId: string) {
    const now = new Date();
    const sessions = await this.prisma.session.updateMany({
      where: { userId: targetUserId, revokedAt: null },
      data: { revokedAt: now },
    });
    const devices = await this.prisma.device.updateMany({
      where: { userId: targetUserId, revokedAt: null },
      data: { revokedAt: now },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId,
        action: 'user.force_logout_all',
        targetType: 'user',
        targetId: targetUserId,
        metadata: { sessions: sessions.count, devices: devices.count },
      },
    });
    return { ok: true, sessions: sessions.count, devices: devices.count };
  }

  async listConversations() {
    const convs = await this.prisma.conversation.findMany({
      where: { kind: { in: ['channel', 'announcement'] } },
      include: { _count: { select: { members: true, messages: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return convs.map((c) => ({
      id: c.id,
      kind: c.kind,
      title: c.title,
      topic: c.topic,
      sensitivity: c.sensitivity,
      pinned: c.pinned,
      memberCount: c._count.members,
      messageCount: c._count.messages,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  async createConversation(adminUserId: string, body: CreateConversationDto) {
    const memberIds = Array.from(new Set([adminUserId, ...body.memberUserIds]));
    const validUsers = await this.prisma.user.findMany({
      where: { id: { in: memberIds }, status: 'active', deletedAt: null },
      select: { id: true },
    });
    if (validUsers.length !== memberIds.length) {
      throw new ConflictException('Some users are not active employees.');
    }

    const conv = await this.prisma.conversation.create({
      data: {
        kind: body.kind,
        title: body.title,
        topic: body.topic ?? null,
        sensitivity: body.sensitivity,
        pinned: body.pinned ?? false,
        members: {
          create: memberIds.map((id) => ({
            userId: id,
            isAdmin: id === adminUserId,
          })),
        },
      },
    });

    for (const id of memberIds) {
      this.realtime.joinUserToConversation(id, conv.id);
      this.realtime.emitToUser(id, 'conversation:created', { conversationId: conv.id });
    }

    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId,
        action: 'conversation.created',
        targetType: 'conversation',
        targetId: conv.id,
        metadata: { kind: body.kind, sensitivity: body.sensitivity, members: memberIds.length },
      },
    });

    return { id: conv.id, kind: conv.kind, title: conv.title };
  }

  async bulkInvite(adminUserId: string, body: BulkInviteDto) {
    const inviteTtlDays = this.inviteTtlDays;
    const expiresAt = new Date(Date.now() + inviteTtlDays * 24 * 60 * 60 * 1000);

    const created: string[] = [];
    const skipped: { row: number; mobileNumber: string; reason: string }[] = [];

    for (let i = 0; i < body.rows.length; i++) {
      const r = body.rows[i]!;
      try {
        const existingUser = await this.prisma.user.findUnique({ where: { mobileNumber: r.mobileNumber } });
        if (existingUser && existingUser.status === 'active') {
          skipped.push({ row: i, mobileNumber: r.mobileNumber, reason: 'User already active' });
          continue;
        }
        const existingInvite = await this.prisma.invite.findFirst({
          where: { mobileNumber: r.mobileNumber, status: { in: ['pending', 'sent'] }, expiresAt: { gt: new Date() } },
        });
        if (existingInvite) {
          skipped.push({ row: i, mobileNumber: r.mobileNumber, reason: 'Active invite exists' });
          continue;
        }
        const inv = await this.prisma.invite.create({
          data: {
            mobileNumber: r.mobileNumber,
            employeeId: r.employeeId,
            displayName: r.displayName,
            department: r.department,
            status: 'sent',
            createdById: adminUserId,
            expiresAt,
          },
        });
        created.push(inv.id);
      } catch (e: any) {
        skipped.push({ row: i, mobileNumber: r.mobileNumber, reason: e?.message ?? 'Unknown error' });
      }
    }

    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId,
        action: 'invite.bulk_created',
        targetType: 'invite',
        metadata: { created: created.length, skipped: skipped.length } as any,
      },
    });

    return { created: created.length, skipped };
  }

  async listFlaggedMessages(limit = 100) {
    const messages = await this.prisma.message.findMany({
      where: { flaggedReasons: { not: null as any } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        sender: { include: { profile: true } },
        conversation: true,
      },
    });
    return messages.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      flagged: m.flaggedReasons,
      sender: { id: m.senderId, displayName: m.sender.profile?.displayName ?? 'Unknown' },
      conversation: { id: m.conversationId, title: m.conversation.title, kind: m.conversation.kind, sensitivity: m.conversation.sensitivity },
    }));
  }

  async listAuditLog(limit = 100) {
    const rows = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { include: { profile: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      metadata: r.metadata,
      ipAddress: r.ipAddress,
      createdAt: r.createdAt.toISOString(),
      actor: r.user?.profile?.displayName ?? null,
      actorEmployeeId: r.user?.profile?.employeeId ?? null,
    }));
  }
}

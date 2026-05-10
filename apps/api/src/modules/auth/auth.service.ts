import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';
import { AuditService } from './audit.service';
import type { OtpRequestDto, OtpVerifyDto, RefreshDto } from './auth.dto';

@Injectable()
export class AuthService {
  private readonly deviceLimit = Number(process.env.DEVICE_LIMIT_PER_USER ?? 5);

  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async requestOtp(input: OtpRequestDto, ip?: string) {
    const { mobileNumber } = input;

    const user = await this.prisma.user.findUnique({ where: { mobileNumber } });
    const invite = await this.prisma.invite.findFirst({
      where: { mobileNumber, status: { in: ['pending', 'sent'] }, expiresAt: { gt: new Date() } },
    });

    if (!user && !invite) {
      await this.audit.log({ action: 'login.otp.rejected.not_invited', metadata: { mobileNumber }, ipAddress: ip });
      throw new ForbiddenException('Number not authorised. Contact your admin.');
    }
    if (user?.status === 'deactivated') {
      await this.audit.log({ userId: user.id, action: 'login.otp.rejected.deactivated', ipAddress: ip });
      throw new ForbiddenException('Account is deactivated.');
    }

    const result = await this.otp.issue(mobileNumber);
    await this.audit.log({ userId: user?.id, action: 'login.otp.issued', metadata: { mobileNumber }, ipAddress: ip });

    return { ok: true, expiresAt: result.expiresAt, devCode: result.devCode };
  }

  async verifyOtp(input: OtpVerifyDto, ip?: string) {
    const { mobileNumber, code, device } = input;

    const ok = await this.otp.verify(mobileNumber, code);
    if (!ok) {
      await this.audit.log({ action: 'login.otp.failed', metadata: { mobileNumber }, ipAddress: ip });
      throw new UnauthorizedException('Invalid or expired code.');
    }

    let user = await this.prisma.user.findUnique({ where: { mobileNumber }, include: { profile: true } });

    if (!user) {
      const invite = await this.prisma.invite.findFirst({
        where: { mobileNumber, status: { in: ['pending', 'sent'] }, expiresAt: { gt: new Date() } },
      });
      if (!invite) {
        await this.audit.log({ action: 'login.otp.rejected.no_invite_at_verify', metadata: { mobileNumber }, ipAddress: ip });
        throw new ForbiddenException('No active invite.');
      }
      user = await this.prisma.user.create({
        data: {
          mobileNumber,
          status: 'active',
          profile: {
            create: {
              employeeId: invite.employeeId,
              displayName: invite.displayName,
              department: invite.department,
            },
          },
        },
        include: { profile: true },
      });
      await this.prisma.invite.update({
        where: { id: invite.id },
        data: { status: 'accepted', acceptedAt: new Date() },
      });
      await this.audit.log({ userId: user.id, action: 'invite.accepted', targetType: 'invite', targetId: invite.id, ipAddress: ip });
    } else if (user.status === 'invited') {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { status: 'active' },
        include: { profile: true },
      });
    }

    const activeDevices = await this.prisma.device.count({
      where: { userId: user.id, revokedAt: null },
    });
    if (activeDevices >= this.deviceLimit) {
      await this.audit.log({ userId: user.id, action: 'device.limit_reached', metadata: { limit: this.deviceLimit }, ipAddress: ip });
      throw new ForbiddenException(`Device limit reached (${this.deviceLimit}). Revoke a device first.`);
    }

    const dev = await this.prisma.device.create({
      data: {
        userId: user.id,
        platform: device.platform,
        name: device.name,
        pushToken: device.pushToken,
        ipLastOctets: ip ? ip.split('.').slice(-2).join('.') : null,
        approvedAt: new Date(),
      },
    });

    const refresh = this.tokens.generateRefresh();
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        deviceId: dev.id,
        refreshTokenHash: refresh.hash,
        refreshFamily: refresh.family,
        expiresAt: this.tokens.refreshExpiry(),
      },
    });

    const accessToken = this.tokens.signAccess({ sub: user.id, did: dev.id, sid: session.id });

    await this.audit.log({ userId: user.id, action: 'login.otp.success', targetType: 'session', targetId: session.id, metadata: { platform: device.platform }, ipAddress: ip });

    return {
      accessToken,
      refreshToken: refresh.token,
      user: {
        id: user.id,
        mobileNumber: user.mobileNumber,
        status: user.status,
        profile: user.profile,
      },
      device: { id: dev.id, platform: dev.platform, name: dev.name },
    };
  }

  async refresh(input: RefreshDto, ip?: string) {
    const candidates = await this.prisma.session.findMany({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      take: 200,
    });

    let matched = null as null | (typeof candidates)[number];
    for (const s of candidates) {
      if (await this.tokens.compareRefresh(input.refreshToken, s.refreshTokenHash)) {
        matched = s;
        break;
      }
    }
    if (!matched) {
      await this.audit.log({ action: 'session.refresh.failed', ipAddress: ip });
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const next = this.tokens.generateRefresh();
    const updated = await this.prisma.session.update({
      where: { id: matched.id },
      data: {
        refreshTokenHash: next.hash,
        refreshFamily: next.family,
        lastUsedAt: new Date(),
        expiresAt: this.tokens.refreshExpiry(),
      },
    });

    const accessToken = this.tokens.signAccess({ sub: updated.userId, did: updated.deviceId, sid: updated.id });

    await this.audit.log({ userId: updated.userId, action: 'session.refresh.success', targetType: 'session', targetId: updated.id, ipAddress: ip });

    return { accessToken, refreshToken: next.token };
  }

  async logout(refreshToken: string, ip?: string) {
    const candidates = await this.prisma.session.findMany({
      where: { revokedAt: null },
      orderBy: { lastUsedAt: 'desc' },
      take: 200,
    });
    for (const s of candidates) {
      if (await this.tokens.compareRefresh(refreshToken, s.refreshTokenHash)) {
        await this.prisma.session.update({ where: { id: s.id }, data: { revokedAt: new Date() } });
        await this.audit.log({ userId: s.userId, action: 'session.logout', targetType: 'session', targetId: s.id, ipAddress: ip });
        return { ok: true };
      }
    }
    return { ok: true };
  }
}

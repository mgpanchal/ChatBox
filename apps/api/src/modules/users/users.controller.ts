import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/jwt.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AccessClaims } from '../auth/token.service';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from '../realtime/presence.service';
import { StorageService } from '../storage/storage.service';
import { signAvatarVariants } from './photo.controller';

@Controller()
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly storage: StorageService,
  ) {}

  @Get('me')
  async me(@CurrentUser() claims: AccessClaims) {
    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
      include: { profile: true },
    });
    if (!user) throw new NotFoundException();
    const photoUrls = await signAvatarVariants(this.storage, user.profile?.photoStorageKey);
    return {
      id: user.id,
      mobileNumber: user.mobileNumber,
      status: user.status,
      isAdmin: user.isAdmin,
      profile: user.profile ? { ...user.profile, photoUrls } : null,
    };
  }

  @Get('me/devices')
  async devices(@CurrentUser() claims: AccessClaims) {
    const devices = await this.prisma.device.findMany({
      where: { userId: claims.sub, revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
    });
    return devices.map((d) => ({
      id: d.id,
      platform: d.platform,
      name: d.name,
      lastSeenAt: d.lastSeenAt.toISOString(),
      createdAt: d.createdAt.toISOString(),
    }));
  }

  @Get('users')
  async list(@CurrentUser() claims: AccessClaims) {
    const users = await this.prisma.user.findMany({
      where: { status: 'active', deletedAt: null, id: { not: claims.sub } },
      include: { profile: true },
      orderBy: { profile: { displayName: 'asc' } },
    });
    return Promise.all(
      users
        .filter((u) => u.profile)
        .map(async (u) => ({
          id: u.id,
          displayName: u.profile!.displayName,
          employeeId: u.profile!.employeeId,
          department: u.profile!.department,
          title: u.profile!.title,
          online: this.presence.isOnline(u.id),
          lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
          photoUrls: await signAvatarVariants(this.storage, u.profile!.photoStorageKey),
        })),
    );
  }
}

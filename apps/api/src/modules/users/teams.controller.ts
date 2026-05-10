import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/jwt.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AccessClaims } from '../auth/token.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('teams')
@UseGuards(JwtAuthGuard)
export class TeamsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() c: AccessClaims) {
    const teams = await this.prisma.team.findMany({
      orderBy: [{ isSystem: 'asc' }, { name: 'asc' }],
      include: {
        members: { where: { userId: c.sub }, select: { userId: true } },
        _count: { select: { members: true } },
      },
    });
    return teams.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      description: t.description,
      isSystem: t.isSystem,
      memberCount: t._count.members,
      iAmMember: t.members.length > 0,
    }));
  }
}

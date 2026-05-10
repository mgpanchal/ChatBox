import { Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/jwt.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AccessClaims } from '../auth/token.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { signAvatarVariants } from './photo.controller';

@Controller('me/mentions')
@UseGuards(JwtAuthGuard)
export class MentionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  async list(@CurrentUser() c: AccessClaims) {
    const rows = await this.prisma.messageMention.findMany({
      where: { userId: c.sub },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        message: {
          include: {
            sender: { include: { profile: true } },
            conversation: true,
          },
        },
      },
    });
    return Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        conversation: {
          id: r.message.conversationId,
          title: r.message.conversation.title,
          kind: r.message.conversation.kind,
          sensitivity: r.message.conversation.sensitivity,
        },
        message: {
          id: r.messageId,
          body: r.message.deletedAt ? null : r.message.body,
          deleted: !!r.message.deletedAt,
          senderName: r.message.sender.profile?.displayName ?? 'Unknown',
          senderPhotoUrls: await signAvatarVariants(this.storage, r.message.sender.profile?.photoStorageKey),
          createdAt: r.message.createdAt.toISOString(),
        },
      })),
    );
  }

  @Post(':id/ack')
  async ack(@CurrentUser() c: AccessClaims, @Param('id', ParseUUIDPipe) id: string) {
    await this.prisma.messageMention.updateMany({
      where: { id, userId: c.sub },
      data: { acknowledgedAt: new Date() },
    });
    return { ok: true };
  }

  @Post('ack-all')
  async ackAll(@CurrentUser() c: AccessClaims) {
    await this.prisma.messageMention.updateMany({
      where: { userId: c.sub, acknowledgedAt: null },
      data: { acknowledgedAt: new Date() },
    });
    return { ok: true };
  }
}

import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/jwt.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod.pipe';
import type { AccessClaims } from '../auth/token.service';
import { ConversationsService } from './conversations.service';

const sendSchema = z.object({
  body: z.string().max(10000).default(''),
  replyToMessageId: z.string().uuid().nullish(),
  attachmentIds: z.array(z.string().uuid()).max(10).optional(),
});
type SendDto = z.infer<typeof sendSchema>;

const createDirectSchema = z.object({
  otherUserId: z.string().uuid(),
});
type CreateDirectDto = z.infer<typeof createDirectSchema>;

const reactionSchema = z.object({ emoji: z.string().min(1).max(16) });
type ReactionDto = z.infer<typeof reactionSchema>;

const editSchema = z.object({ body: z.string().min(1).max(10000) });
type EditDto = z.infer<typeof editSchema>;

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly svc: ConversationsService) {}

  @Get()
  list(@CurrentUser() c: AccessClaims) {
    return this.svc.listForUser(c.sub);
  }

  @Get(':id')
  get(@CurrentUser() c: AccessClaims, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getDetail(c.sub, id);
  }

  @Get(':id/messages')
  messages(
    @CurrentUser() c: AccessClaims,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('before') before?: string,
    @Query('around') around?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.listMessages(c.sub, id, {
      before,
      around,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post(':id/messages')
  @UseGuards(ThrottlerGuard)
  @Throttle({ send: { limit: 60, ttl: 60_000 } })
  send(
    @CurrentUser() c: AccessClaims,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(sendSchema)) body: SendDto,
  ) {
    return this.svc.sendMessage(c.sub, id, body.body, body.replyToMessageId ?? undefined, body.attachmentIds ?? []);
  }

  @Post('direct')
  createDirect(
    @CurrentUser() c: AccessClaims,
    @Body(new ZodValidationPipe(createDirectSchema)) body: CreateDirectDto,
  ) {
    return this.svc.findOrCreateDirect(c.sub, body.otherUserId);
  }

  @Post(':id/messages/:msgId/reactions')
  toggleReaction(
    @CurrentUser() c: AccessClaims,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('msgId', ParseUUIDPipe) msgId: string,
    @Body(new ZodValidationPipe(reactionSchema)) body: ReactionDto,
  ) {
    return this.svc.toggleReaction(c.sub, id, msgId, body.emoji);
  }

  @Patch(':id/messages/:msgId')
  editMessage(
    @CurrentUser() c: AccessClaims,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('msgId', ParseUUIDPipe) msgId: string,
    @Body(new ZodValidationPipe(editSchema)) body: EditDto,
  ) {
    return this.svc.editMessage(c.sub, id, msgId, body.body);
  }

  @Delete(':id/messages/:msgId')
  deleteMessage(
    @CurrentUser() c: AccessClaims,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('msgId', ParseUUIDPipe) msgId: string,
  ) {
    return this.svc.deleteMessage(c.sub, id, msgId);
  }

  @Get(':id/search')
  @UseGuards(ThrottlerGuard)
  @Throttle({ send: { limit: 30, ttl: 60_000 } })
  searchInConv(
    @CurrentUser() c: AccessClaims,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('q') q: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.search(c.sub, id, q ?? '', {
      before,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id/members')
  listMembers(@CurrentUser() c: AccessClaims, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.listMembers(c.sub, id);
  }

  @Post(':id/mute')
  mute(@CurrentUser() c: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() body: { mutedUntil: string | null }) {
    return this.svc.setMute(c.sub, id, body?.mutedUntil ? new Date(body.mutedUntil) : null);
  }

  @Post(':id/leave')
  leave(@CurrentUser() c: AccessClaims, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.leave(c.sub, id);
  }
}

import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/jwt.guard';
import { AdminGuard } from '../../common/admin.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod.pipe';
import type { AccessClaims } from '../auth/token.service';
import { AdminService } from './admin.service';
import { addMembersSchema, bulkInviteSchema, createConversationSchema, createInviteSchema, setAdminSchema, setStatusSchema, type AddMembersDto, type BulkInviteDto, type CreateConversationDto, type CreateInviteDto, type SetAdminDto, type SetStatusDto } from './admin.dto';
import { ConversationsService } from '../conversations/conversations.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly svc: AdminService, private readonly convos: ConversationsService) {}

  @Get('stats')
  stats() {
    return this.svc.stats();
  }

  @Get('invites')
  listInvites() {
    return this.svc.listInvites();
  }

  @Post('invites')
  createInvite(
    @CurrentUser() c: AccessClaims,
    @Body(new ZodValidationPipe(createInviteSchema)) body: CreateInviteDto,
  ) {
    return this.svc.createInvite(c.sub, body);
  }

  @Post('invites/bulk')
  bulkInvite(
    @CurrentUser() c: AccessClaims,
    @Body(new ZodValidationPipe(bulkInviteSchema)) body: BulkInviteDto,
  ) {
    return this.svc.bulkInvite(c.sub, body);
  }

  @Get('flagged')
  flagged(@Query('limit') limit?: string) {
    return this.svc.listFlaggedMessages(limit ? Math.min(Number(limit), 500) : 100);
  }

  @Post('invites/:id/revoke')
  revokeInvite(@CurrentUser() c: AccessClaims, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.revokeInvite(c.sub, id);
  }

  @Get('users')
  listUsers() {
    return this.svc.listUsers();
  }

  @Post('users/:id/status')
  setUserStatus(
    @CurrentUser() c: AccessClaims,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setStatusSchema)) body: SetStatusDto,
  ) {
    return this.svc.setUserStatus(c.sub, id, body.status);
  }

  @Post('users/:id/admin')
  setUserAdmin(
    @CurrentUser() c: AccessClaims,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setAdminSchema)) body: SetAdminDto,
  ) {
    return this.svc.setUserAdmin(c.sub, id, body.isAdmin);
  }

  @Post('users/:id/force-logout')
  forceLogoutAll(
    @CurrentUser() c: AccessClaims,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.forceLogoutAll(c.sub, id);
  }

  @Get('audit')
  audit(@Query('limit') limit?: string) {
    return this.svc.listAuditLog(limit ? Math.min(Number(limit), 500) : 100);
  }

  @Get('conversations')
  listConversations() {
    return this.svc.listConversations();
  }

  @Post('conversations')
  createConversation(
    @CurrentUser() c: AccessClaims,
    @Body(new ZodValidationPipe(createConversationSchema)) body: CreateConversationDto,
  ) {
    return this.svc.createConversation(c.sub, body);
  }

  @Post('conversations/:id/members')
  addMembers(
    @CurrentUser() c: AccessClaims,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(addMembersSchema)) body: AddMembersDto,
  ) {
    return this.convos.addMembers(c.sub, id, body.userIds);
  }

  @Post('conversations/:id/members/:userId/remove')
  removeMember(
    @CurrentUser() c: AccessClaims,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.convos.removeMember(c.sub, id, userId);
  }
}

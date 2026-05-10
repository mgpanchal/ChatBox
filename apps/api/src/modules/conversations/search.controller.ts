import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/jwt.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AccessClaims } from '../auth/token.service';
import { ConversationsService } from './conversations.service';

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly svc: ConversationsService) {}

  @Get()
  @UseGuards(ThrottlerGuard)
  @Throttle({ send: { limit: 30, ttl: 60_000 } })
  search(
    @CurrentUser() c: AccessClaims,
    @Query('q') q: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.search(c.sub, null, q ?? '', {
      before,
      limit: limit ? Number(limit) : undefined,
    });
  }
}

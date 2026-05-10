import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ConversationsModule } from './conversations/conversations.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AdminModule } from './admin/admin.module';
import { StorageModule } from './storage/storage.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [
    // No global guard. Each rate-limited route opts in by combining
    // @UseGuards(ThrottlerGuard) with @Throttle({ <name>: { limit, ttl } }).
    // A chat app legitimately bursts (prefetch, hover, message stream),
    // so blanket throttling would block normal usage.
    ThrottlerModule.forRoot([
      { name: 'strict', ttl: 60_000, limit: 10 },
      { name: 'send', ttl: 60_000, limit: 120 },
    ]),
    PrismaModule,
    AuthModule,
    RealtimeModule,
    StorageModule,
    UsersModule,
    ConversationsModule,
    AdminModule,
    UploadsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

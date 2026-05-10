import { Module, forwardRef } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { AdminGuard } from '../../common/admin.guard';

@Module({
  imports: [AuthModule, RealtimeModule, ConversationsModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}

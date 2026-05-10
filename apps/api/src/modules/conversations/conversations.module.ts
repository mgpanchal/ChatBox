import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { SearchController } from './search.controller';
import { ConversationsService } from './conversations.service';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [ConversationsController, SearchController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}

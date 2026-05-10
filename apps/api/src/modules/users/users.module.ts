import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { MentionsController } from './mentions.controller';
import { TeamsController } from './teams.controller';
import { PhotoController } from './photo.controller';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [UsersController, MentionsController, TeamsController, PhotoController],
})
export class UsersModule {}

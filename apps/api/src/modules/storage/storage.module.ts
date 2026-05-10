import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { FilesController } from './files.controller';

@Global()
@Module({
  providers: [StorageService],
  controllers: [FilesController],
  exports: [StorageService],
})
export class StorageModule {}

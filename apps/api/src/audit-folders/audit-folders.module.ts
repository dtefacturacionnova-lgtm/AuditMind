import { Module } from '@nestjs/common';
import { AuditFoldersController } from './audit-folders.controller';
import { AuditFoldersService } from './audit-folders.service';

@Module({
  controllers: [AuditFoldersController],
  providers: [AuditFoldersService],
  exports: [AuditFoldersService],
})
export class AuditFoldersModule {}

import { Module } from '@nestjs/common';
import { AuditFoldersController } from './audit-folders.controller';
import { AuditFoldersService } from './audit-folders.service';
import { IndexTemplatesModule } from '../index-templates/index-templates.module';

@Module({
  imports: [IndexTemplatesModule],
  controllers: [AuditFoldersController],
  providers: [AuditFoldersService],
  exports: [AuditFoldersService],
})
export class AuditFoldersModule {}

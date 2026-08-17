import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuditBackupController } from './audit-backup.controller';
import { AuditBackupService } from './audit-backup.service';
import { AuditBackupExportService } from './audit-backup-export.service';
import { AuditBackupFilesService } from './audit-backup-files.service';
import { AuditBackupPackageService } from './audit-backup-package.service';
import { AuditBackupRestoreService } from './audit-backup-restore.service';

@Module({
  imports: [MulterModule.register({ storage: memoryStorage() })],
  controllers: [AuditBackupController],
  providers: [
    AuditBackupService, AuditBackupExportService,
    AuditBackupFilesService, AuditBackupPackageService,
    AuditBackupRestoreService,
  ],
  exports: [AuditBackupService, AuditBackupRestoreService],
})
export class AuditBackupModule {}

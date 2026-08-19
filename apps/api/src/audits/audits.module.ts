import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuditsController } from './audits.controller';
import { AuditsService } from './audits.service';
import { AuditIndexService } from './audit-index.service';
import { AiModule } from '../ai/ai.module';
import { AuditFoldersModule } from '../audit-folders/audit-folders.module';

@Module({
  imports: [
    AiModule,
    AuditFoldersModule,
    MulterModule.register({ storage: memoryStorage() }),
  ],
  controllers: [AuditsController],
  providers: [AuditsService, AuditIndexService],
  // AuditIndexService se exporta para que PortfolioModule pueda hacer el scaffold
  // del expediente al aprobar un encargo, reutilizando el mismo servicio que usa
  // AuditsService.create() en vez de duplicar la creación de papeles.
  exports: [AuditsService, AuditIndexService],
})
export class AuditsModule {}

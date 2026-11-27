import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuditsController } from './audits.controller';
import { AuditsService } from './audits.service';
import { AuditIndexService } from './audit-index.service';
import { AuditVisitsController } from './visits/audit-visits.controller';
import { AuditVisitsService } from './visits/audit-visits.service';
import { AiModule } from '../ai/ai.module';
import { AuditFoldersModule } from '../audit-folders/audit-folders.module';

@Module({
  imports: [
    AiModule,
    AuditFoldersModule,
    MulterModule.register({ storage: memoryStorage() }),
  ],
  // AuditVisitsController va ANTES que AuditsController: sus rutas `audits/visits/...` no deben ser tomadas por patrones `audits/:id/...`.
  controllers: [AuditVisitsController, AuditsController],
  providers: [AuditsService, AuditIndexService, AuditVisitsService],
  // AuditIndexService se exporta para que PortfolioModule pueda hacer el scaffold
  // del expediente al aprobar un encargo, reutilizando el mismo servicio que usa
  // AuditsService.create() en vez de duplicar la creación de papeles.
  exports: [AuditsService, AuditIndexService],
})
export class AuditsModule {}

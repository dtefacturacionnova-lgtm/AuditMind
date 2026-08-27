import { Module } from '@nestjs/common';
import { StandardsService } from './standards.service';
import { AssessmentsService } from './assessments.service';
import { AssessmentsController } from './assessments.controller';
import { GovernanceService } from './governance.service';
import { GovernanceController } from './governance.controller';

/**
 * QAIP y Calidad — dos tracks normativos paralelos (ver el artefacto de diseño
 * publicado en esta sesión): IIA_INTERNAL (Normas Globales del IIA 2024,
 * Dominio V) y NIGC_EXTERNAL (NIGC 1/2 = ISQM 1/2, obligatorias CVPCPA).
 * V1: catálogo de standards + autoevaluación estructurada por standard +
 * declaración de independencia + estatuto de auditoría. V2/V3 (hallazgos,
 * causa raíz, EQR) se agregan como módulos propios sobre esta base.
 */
@Module({
  controllers: [AssessmentsController, GovernanceController],
  providers: [StandardsService, AssessmentsService, GovernanceService],
  exports: [StandardsService],
})
export class QaipModule {}

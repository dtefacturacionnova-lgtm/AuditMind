import { Module } from '@nestjs/common';
import { StandardsService } from './standards.service';
import { AssessmentsService } from './assessments.service';
import { AssessmentsController } from './assessments.controller';
import { GovernanceService } from './governance.service';
import { GovernanceController } from './governance.controller';
import { FindingsService } from './findings.service';
import { FindingsController } from './findings.controller';
import { PerformanceService } from './performance.service';
import { PerformanceController } from './performance.controller';
import { EqrService } from './eqr.service';
import { EqrController } from './eqr.controller';
import { CompetenciesService } from './competencies.service';
import { CompetenciesController } from './competencies.controller';
import { PortfolioModule } from '../portfolio/portfolio.module';

/**
 * QAIP y Calidad — dos tracks normativos paralelos (ver el artefacto de diseño
 * publicado en esta sesión): IIA_INTERNAL (Normas Globales del IIA 2024,
 * Dominio V) y NIGC_EXTERNAL (NIGC 1/2 = ISQM 1/2, obligatorias CVPCPA).
 * V1: catálogo de standards + autoevaluación estructurada por standard +
 * declaración de independencia + estatuto de auditoría.
 * V2: hallazgos de calidad + causa raíz obligatoria (NIGC 1 comp. 8) +
 * remediación + tablero de KPIs de desempeño calculado sin pedir datos nuevos.
 * V3: Revisión de Calidad del Encargo (EQR, NIGC 2) con gate real sobre el
 * sign-off final en WorkingPapersService.signOff() — ver el comentario ahí.
 */
@Module({
  imports: [PortfolioModule],
  controllers: [AssessmentsController, GovernanceController, FindingsController, PerformanceController, EqrController, CompetenciesController],
  providers: [StandardsService, AssessmentsService, GovernanceService, FindingsService, PerformanceService, EqrService, CompetenciesService],
  exports: [StandardsService],
})
export class QaipModule {}

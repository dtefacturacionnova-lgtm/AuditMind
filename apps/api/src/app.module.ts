import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { TenantContextMiddleware } from './common/middleware/tenant-context.middleware';
import { OrganizationsModule } from './organizations/organizations.module';
import { UsersModule } from './users/users.module';
import { AuditUniverseModule } from './audit-universe/audit-universe.module';
import { AuditsModule } from './audits/audits.module';
import { WorkingPapersModule } from './working-papers/working-papers.module';
import { FindingsModule } from './findings/findings.module';
import { PbcModule } from './pbc/pbc.module';
import { ConfirmationsModule } from './confirmations/confirmations.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PlansModule } from './plans/plans.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReportsModule } from './reports/reports.module';
import { AiModule } from './ai/ai.module';
import { DataSourcesModule } from './data-sources/data-sources.module';
import { RisksModule } from './risks/risks.module';
import { AuditFoldersModule } from './audit-folders/audit-folders.module';
import { IndexTemplatesModule } from './index-templates/index-templates.module';
import { AuditTemplatesModule } from './audit-templates/audit-templates.module';
import { ContentLibraryModule } from './content-library/content-library.module';
import { CatalogsModule } from './catalogs/catalogs.module';
import { StrategicModule } from './strategic/strategic.module';
import { AuditProjectsModule } from './audit-projects/audit-projects.module';
import { EmailModule } from './email/email.module';
import { PdfModule } from './pdf/pdf.module';
import { FiscalModule } from './fiscal/fiscal.module';
import { AuditProceduresModule } from './audit-procedures/audit-procedures.module';
import { AuditBackupModule } from './audits/backup/audit-backup.module';
import { FieldEvidenceModule } from './working-papers/field-evidence/field-evidence.module';
import { CapacityModule } from './capacity/capacity.module';
import { TimesheetModule } from './timesheet/timesheet.module';
import { PortfolioModule } from './portfolio/portfolio.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    AuthModule,
    OrganizationsModule,
    UsersModule,
    AuditUniverseModule,
    AuditsModule,
    AuditBackupModule,
    WorkingPapersModule,
    FieldEvidenceModule,
    FindingsModule,
    PbcModule,
    ConfirmationsModule,
    PlansModule,
    NotificationsModule,
    EmailModule,
    PdfModule,
    FiscalModule,
    ReportsModule,
    DashboardModule,
    AiModule,
    DataSourcesModule,
    RisksModule,
    AuditFoldersModule,
    IndexTemplatesModule,
    AuditTemplatesModule,
    ContentLibraryModule,
    CatalogsModule,
    StrategicModule,
    AuditProjectsModule,
    AuditProceduresModule,
    TimesheetModule,
    CapacityModule,
    PortfolioModule,
  ],
  providers: [
    // Guards globales — aplican a todos los endpoints excepto los @Public()
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantContextMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}

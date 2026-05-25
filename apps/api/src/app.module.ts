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
import { CatalogsModule } from './catalogs/catalogs.module';
import { StrategicModule } from './strategic/strategic.module';
import { AuditProjectsModule } from './audit-projects/audit-projects.module';

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
    WorkingPapersModule,
    FindingsModule,
    PbcModule,
    ConfirmationsModule,
    PlansModule,
    NotificationsModule,
    ReportsModule,
    DashboardModule,
    AiModule,
    DataSourcesModule,
    RisksModule,
    AuditFoldersModule,
    IndexTemplatesModule,
    CatalogsModule,
    StrategicModule,
    AuditProjectsModule,
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

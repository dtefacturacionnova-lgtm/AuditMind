import { Global, Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { BillingAdminController } from './billing-admin.controller';
import { BillingRemindersService } from './billing-reminders.service';
import { BillingUsageAlertsService } from './billing-usage-alerts.service';
import { BillingSettingsService } from './billing-settings.service';
import { BillingUsageService } from './billing-usage.service';
import { BillingController } from './billing.controller';
import { BillingScheduler } from './billing.scheduler';
import { EntitlementsService } from './entitlements.service';
import { PaymentsService } from './payments.service';
import { PlansService } from './plans.service';
import { PublicPlansController } from './public-plans.controller';
import { StorageEgressService } from './storage-egress.service';
import { StorageUsageService } from './storage-usage.service';
import { SubscriptionGuard } from './subscription.guard';
import { SubscriptionsService } from './subscriptions.service';
import { UsageService } from './usage.service';

/**
 * Planes y suscripciones (docs/suscripciones-y-planes-propuesta.md). Global: el guardián, la creación de organizaciones, las
 * invitaciones y el chat de IA consultan los derechos desde cualquier módulo.
 */
@Global()
@Module({
  imports: [NotificationsModule],
  controllers: [BillingController, BillingAdminController, PublicPlansController],
  providers: [
    BillingSettingsService, EntitlementsService, PlansService, SubscriptionsService, SubscriptionGuard,
    UsageService, StorageUsageService, StorageEgressService, BillingUsageService, PaymentsService,
    BillingRemindersService, BillingUsageAlertsService, BillingScheduler,
  ],
  exports: [BillingSettingsService, EntitlementsService, SubscriptionsService, SubscriptionGuard, UsageService, StorageUsageService, StorageEgressService],
})
export class BillingModule {}

import { Global, Module } from '@nestjs/common';
import { BillingAdminController } from './billing-admin.controller';
import { BillingSettingsService } from './billing-settings.service';
import { BillingUsageService } from './billing-usage.service';
import { BillingController } from './billing.controller';
import { EntitlementsService } from './entitlements.service';
import { PaymentsService } from './payments.service';
import { PlansService } from './plans.service';
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
  controllers: [BillingController, BillingAdminController],
  providers: [
    BillingSettingsService, EntitlementsService, PlansService, SubscriptionsService, SubscriptionGuard,
    UsageService, StorageUsageService, BillingUsageService, PaymentsService,
  ],
  exports: [BillingSettingsService, EntitlementsService, SubscriptionsService, SubscriptionGuard, UsageService, StorageUsageService],
})
export class BillingModule {}

import { Global, Module } from '@nestjs/common';
import { BillingAdminController } from './billing-admin.controller';
import { BillingSettingsService } from './billing-settings.service';
import { BillingController } from './billing.controller';
import { EntitlementsService } from './entitlements.service';
import { PlansService } from './plans.service';
import { SubscriptionGuard } from './subscription.guard';
import { SubscriptionsService } from './subscriptions.service';

/**
 * Planes y suscripciones (docs/suscripciones-y-planes-propuesta.md). Global: el guardián, la creación de organizaciones, las
 * invitaciones y el chat de IA consultan los derechos desde cualquier módulo.
 */
@Global()
@Module({
  controllers: [BillingController, BillingAdminController],
  providers: [BillingSettingsService, EntitlementsService, PlansService, SubscriptionsService, SubscriptionGuard],
  exports: [BillingSettingsService, EntitlementsService, SubscriptionsService, SubscriptionGuard],
})
export class BillingModule {}

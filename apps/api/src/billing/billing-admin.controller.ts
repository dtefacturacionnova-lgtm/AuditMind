import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthUser } from '../auth/jwt.strategy';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { BillingSettingsService } from './billing-settings.service';
import { BillingUsageService } from './billing-usage.service';
import {
  AssignPlanDto, CreatePlanDto, ExtendTrialDto, RejectPaymentDto, RenewDto, SavePackDto, UpdateBillingSettingsDto, UpdatePlanDto, UpdateSubscriptionDto,
} from './dto/billing.dto';
import { PaymentsService } from './payments.service';
import { PlansService } from './plans.service';
import { SubscriptionsService } from './subscriptions.service';

/** Lo que ve el SUPERADMIN: planes, suscripciones de todas las organizaciones y parámetros de la plataforma. */
@ApiTags('Facturación (superadmin)')
@ApiBearerAuth()
@Roles(UserRole.SUPER_ADMIN)
@Controller('billing-admin')
export class BillingAdminController {
  constructor(
    private readonly plans: PlansService,
    private readonly subscriptions: SubscriptionsService,
    private readonly settings: BillingSettingsService,
    private readonly payments: PaymentsService,
    private readonly usage: BillingUsageService,
  ) {}

  // ── Planes ──
  @Get('plans')
  @ApiOperation({ summary: 'Planes con sus precios y cuántas organizaciones los usan' })
  listPlans() {
    return this.plans.list();
  }

  @Get('plans/:id')
  getPlan(@Param('id') id: string) {
    return this.plans.get(id);
  }

  @Post('plans')
  createPlan(@Body() dto: CreatePlanDto, @CurrentUser() user: AuthUser) {
    return this.plans.create(dto, user.id);
  }

  @Patch('plans/:id')
  updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto, @CurrentUser() user: AuthUser) {
    return this.plans.update(id, dto, user.id);
  }

  @Post('plans/:id/apply')
  @ApiOperation({ summary: 'Aplicar el plan a sus clientes actuales (refresca la copia que guarda cada suscripción)' })
  applyPlan(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.plans.applyToSubscribers(id, user.id);
  }

  // ── Suscripciones ──
  @Get('subscriptions')
  listSubscriptions() {
    return this.subscriptions.list();
  }

  @Post('subscriptions/:organizationId/assign')
  @ApiOperation({ summary: 'Asignar o cambiar el plan (y la duración de la licencia) de una organización' })
  assign(@Param('organizationId') organizationId: string, @Body() dto: AssignPlanDto, @CurrentUser() user: AuthUser) {
    return this.subscriptions.assign(organizationId, dto, user.id);
  }

  @Post('subscriptions/:organizationId/renew')
  renew(@Param('organizationId') organizationId: string, @Body() dto: RenewDto, @CurrentUser() user: AuthUser) {
    return this.subscriptions.renew(organizationId, dto.months, user.id);
  }

  @Post('subscriptions/:organizationId/extend-trial')
  extendTrial(@Param('organizationId') organizationId: string, @Body() dto: ExtendTrialDto, @CurrentUser() user: AuthUser) {
    return this.subscriptions.extendTrial(organizationId, dto.days, user.id);
  }

  @Patch('subscriptions/:organizationId')
  @ApiOperation({ summary: 'Ajustes por cliente: precio pactado, usuarios extra, módulos sueltos, exención, suspensión' })
  updateSubscription(@Param('organizationId') organizationId: string, @Body() dto: UpdateSubscriptionDto, @CurrentUser() user: AuthUser) {
    return this.subscriptions.update(organizationId, dto, user.id);
  }

  @Get('events')
  @ApiOperation({ summary: 'Registro de actividad (quién, cuándo y qué cambió)' })
  events(@Query('organizationId') organizationId?: string, @Query('limit') limit?: string) {
    return this.subscriptions.events(organizationId, limit ? Number(limit) : 50);
  }

  // ── Pagos (aprobación manual) ──
  @Get('payments')
  @ApiOperation({ summary: 'Pagos de todas las organizaciones (filtro por estado)' })
  listPayments(@Query('status') status?: string, @Query('organizationId') organizationId?: string) {
    return this.payments.listAll({ status, organizationId });
  }

  @Get('payments/:id/proof-url')
  @ApiOperation({ summary: 'Enlace temporal (5 min) al comprobante de un pago' })
  proofUrl(@Param('id') id: string) {
    return this.payments.proofUrl(id);
  }

  @Post('payments/:id/approve')
  @ApiOperation({ summary: 'Aprobar el pago: acredita la licencia o el paquete, una sola vez' })
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.payments.approve(id, user.id);
  }

  @Post('payments/:id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectPaymentDto, @CurrentUser() user: AuthUser) {
    return this.payments.reject(id, user.id, dto.reason);
  }

  // ── Paquetes ──
  @Get('packs')
  listPacks() {
    return this.payments.listPacks();
  }

  @Post('packs')
  createPack(@Body() dto: SavePackDto, @CurrentUser() user: AuthUser) {
    return this.payments.createPack(dto, user.id);
  }

  @Patch('packs/:id')
  updatePack(@Param('id') id: string, @Body() dto: SavePackDto, @CurrentUser() user: AuthUser) {
    return this.payments.updatePack(id, dto, user.id);
  }

  // ── Consumo y costos (dinero Y peticiones) ──
  @Get('consumption')
  @ApiOperation({ summary: 'Consumo del mes por organización, asistente y tipo de archivo: peticiones, dinero y margen' })
  consumption(@Query('period') period?: string) {
    return this.usage.adminConsumption(period && /^\d{4}-(0[1-9]|1[0-2])$/.test(period) ? period : undefined);
  }

  // ── Parámetros de la plataforma ──
  @Get('settings')
  getSettings() {
    return this.settings.get();
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Parámetros: interruptor de cumplimiento (OFF / OBSERVE / ENFORCE), gracia, costo por petición…' })
  updateSettings(@Body() dto: UpdateBillingSettingsDto, @CurrentUser() user: AuthUser) {
    return this.settings.update(dto, user.id);
  }
}

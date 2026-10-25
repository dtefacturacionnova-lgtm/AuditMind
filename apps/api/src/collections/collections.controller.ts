import { Controller, Delete, Get, Param, Patch, Post, Put, Body, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { FeesService } from './fees.service';
import { InvoicesService } from './invoices.service';
import { PaymentsService } from './payments.service';
import {
  AddWithholdingDto, AmendFeeDto, ApplyPaymentDto, CreateScheduleItemDto, GenerateScheduleDto, ListInvoicesQueryDto, ListPaymentsQueryDto,
  ListWithholdingsQueryDto, ReasonDto, RegisterInvoiceDto, RegisterPaymentDto, SetFeeDto, UpdateInvoiceDto, UpdatePaymentDto,
  UpdateScheduleItemDto,
} from './dto/collections.dto';

/**
 * Cobro de honorarios: honorario, calendario, facturas registradas (DTE), cobros, aplicaciones y retenciones.
 * Solo se REGISTRA lo que ya se emitió (no se factura en línea ni se habla con Hacienda).
 * @Roles es la primera barrera; los servicios vuelven a comprobar el rol (gerente o dirección) y la modalidad de la organización.
 */
@ApiTags('Cobranza')
@ApiBearerAuth()
@Controller('collections')
export class CollectionsController {
  constructor(
    private readonly fees: FeesService,
    private readonly invoices: InvoicesService,
    private readonly payments: PaymentsService,
  ) {}

  // ── Honorario y adendas ────────────────────────────────────────────────────
  @Get('engagements/:engagementId/fee')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Honorario, adendas, calendario y resumen de cobros de un encargo' })
  getFee(@Param('engagementId') id: string, @CurrentUser() user: AuthUser) {
    return this.fees.getFee(id, user);
  }

  @Put('engagements/:engagementId/fee')
  @Roles(UserRole.CAE)
  @ApiOperation({ summary: 'Definir o cambiar el honorario (dirección). Después de haber cuotas o facturas, solo por adenda' })
  setFee(@Param('engagementId') id: string, @Body() dto: SetFeeDto, @CurrentUser() user: AuthUser) {
    return this.fees.setFee(id, dto, user);
  }

  @Delete('engagements/:engagementId/fee')
  @Roles(UserRole.CAE)
  @ApiOperation({ summary: 'Borrar el honorario (solo si no tiene adendas, cuotas ni facturas)' })
  deleteFee(@Param('engagementId') id: string, @CurrentUser() user: AuthUser) {
    return this.fees.deleteFee(id, user);
  }

  @Get('engagements/:engagementId/fee/amendments')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Adendas del honorario' })
  listAmendments(@Param('engagementId') id: string, @CurrentUser() user: AuthUser) {
    return this.fees.listAmendments(id, user);
  }

  @Post('engagements/:engagementId/fee/amendments')
  @Roles(UserRole.CAE)
  @ApiOperation({ summary: 'Registrar una adenda que sube o baja el honorario (dirección)' })
  amendFee(@Param('engagementId') id: string, @Body() dto: AmendFeeDto, @CurrentUser() user: AuthUser) {
    return this.fees.amendFee(id, dto, user);
  }

  // ── Calendario ─────────────────────────────────────────────────────────────
  @Get('engagements/:engagementId/schedule')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Calendario de cobros del encargo' })
  listSchedule(@Param('engagementId') id: string, @CurrentUser() user: AuthUser) {
    return this.fees.listSchedule(id, user);
  }

  @Post('engagements/:engagementId/schedule/generate')
  @Roles(UserRole.CAE)
  @ApiOperation({ summary: 'Generar el calendario: cuotas iguales, hitos o pago único (dirección)' })
  generateSchedule(@Param('engagementId') id: string, @Body() dto: GenerateScheduleDto, @CurrentUser() user: AuthUser) {
    return this.fees.generateSchedule(id, dto, user);
  }

  @Post('engagements/:engagementId/schedule')
  @Roles(UserRole.CAE)
  @ApiOperation({ summary: 'Agregar una cuota a mano (dirección)' })
  createItem(@Param('engagementId') id: string, @Body() dto: CreateScheduleItemDto, @CurrentUser() user: AuthUser) {
    return this.fees.createItem(id, dto, user);
  }

  @Get('schedule/:itemId')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Detalle de una cuota' })
  getItem(@Param('itemId') id: string, @CurrentUser() user: AuthUser) {
    return this.fees.getItem(id, user);
  }

  @Patch('schedule/:itemId')
  @Roles(UserRole.CAE)
  @ApiOperation({ summary: 'Editar una cuota todavía sin factura (dirección)' })
  updateItem(@Param('itemId') id: string, @Body() dto: UpdateScheduleItemDto, @CurrentUser() user: AuthUser) {
    return this.fees.updateItem(id, dto, user);
  }

  @Post('schedule/:itemId/cancel')
  @Roles(UserRole.CAE)
  @ApiOperation({ summary: 'Cancelar una cuota todavía sin factura (dirección)' })
  cancelItem(@Param('itemId') id: string, @CurrentUser() user: AuthUser) {
    return this.fees.cancelItem(id, user);
  }

  @Delete('schedule/:itemId')
  @Roles(UserRole.CAE)
  @ApiOperation({ summary: 'Borrar una cuota que nunca tuvo factura (dirección)' })
  deleteItem(@Param('itemId') id: string, @CurrentUser() user: AuthUser) {
    return this.fees.deleteItem(id, user);
  }

  // ── Facturas ───────────────────────────────────────────────────────────────
  @Post('invoices')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Registrar una factura ya emitida como DTE (desde una cuota o libre)' })
  registerInvoice(@Body() dto: RegisterInvoiceDto, @CurrentUser() user: AuthUser) {
    return this.invoices.register(dto, user);
  }

  @Get('invoices')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Facturas, con filtros por cliente, encargo, estado, vencidas y búsqueda' })
  listInvoices(@Query() q: ListInvoicesQueryDto, @CurrentUser() user: AuthUser) {
    return this.invoices.list(q, user);
  }

  @Get('invoices/:id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Detalle de la factura con sus cobros, retenciones y bitácora' })
  getInvoice(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.invoices.get(id, user);
  }

  @Patch('invoices/:id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Editar la factura: todo sin movimientos; con movimientos, solo fechas y descripción' })
  updateInvoice(@Param('id') id: string, @Body() dto: UpdateInvoiceDto, @CurrentUser() user: AuthUser) {
    return this.invoices.update(id, dto, user);
  }

  @Post('invoices/:id/void')
  @Roles(UserRole.CAE)
  @ApiOperation({ summary: 'Anular una factura sin cobros (dirección, con motivo)' })
  voidInvoice(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() user: AuthUser) {
    return this.invoices.void(id, dto, user);
  }

  // ── Retenciones ────────────────────────────────────────────────────────────
  @Post('invoices/:id/withholdings')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Anotar una retención en la factura (por ejemplo, el comprobante llegó tarde)' })
  addWithholding(@Param('id') id: string, @Body() dto: AddWithholdingDto, @CurrentUser() user: AuthUser) {
    return this.invoices.addWithholding(id, dto, user);
  }

  @Get('withholdings')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Retenciones sufridas, por periodo, impuesto y cliente' })
  listWithholdings(@Query() q: ListWithholdingsQueryDto, @CurrentUser() user: AuthUser) {
    return this.invoices.listWithholdings(q, user);
  }

  @Post('withholdings/:id/reverse')
  @Roles(UserRole.CAE)
  @ApiOperation({ summary: 'Revertir una retención mal anotada (dirección, con motivo)' })
  reverseWithholding(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() user: AuthUser) {
    return this.invoices.reverseWithholding(id, dto, user);
  }

  // ── Cobros ─────────────────────────────────────────────────────────────────
  @Post('payments')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Registrar un cobro, con sus aplicaciones y las retenciones practicadas en ese pago' })
  registerPayment(@Body() dto: RegisterPaymentDto, @CurrentUser() user: AuthUser) {
    return this.payments.register(dto, user);
  }

  @Get('payments')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Cobros, con filtros por cliente, estado, fechas y saldo a favor' })
  listPayments(@Query() q: ListPaymentsQueryDto, @CurrentUser() user: AuthUser) {
    return this.payments.list(q, user);
  }

  @Get('payments/:id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Detalle del cobro con sus aplicaciones, retenciones y bitácora' })
  getPayment(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.payments.get(id, user);
  }

  @Patch('payments/:id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Editar fecha, forma, referencia y notas del cobro (el monto solo sin aplicaciones)' })
  updatePayment(@Param('id') id: string, @Body() dto: UpdatePaymentDto, @CurrentUser() user: AuthUser) {
    return this.payments.update(id, dto, user);
  }

  @Post('payments/:id/apply')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Aplicar el saldo a favor de un cobro a facturas (y anotar retenciones)' })
  applyPayment(@Param('id') id: string, @Body() dto: ApplyPaymentDto, @CurrentUser() user: AuthUser) {
    return this.payments.apply(id, dto, user);
  }

  @Post('payments/:id/applications/:applicationId/remove')
  @Roles(UserRole.CAE)
  @ApiOperation({ summary: 'Quitar una aplicación de un cobro (dirección, con motivo)' })
  removeApplication(
    @Param('id') id: string, @Param('applicationId') applicationId: string, @Body() dto: ReasonDto, @CurrentUser() user: AuthUser,
  ) {
    return this.payments.unapply(id, applicationId, dto, user);
  }

  @Post('payments/:id/void')
  @Roles(UserRole.CAE)
  @ApiOperation({ summary: 'Anular un cobro y revertir sus aplicaciones (dirección, con motivo)' })
  voidPayment(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() user: AuthUser) {
    return this.payments.void(id, dto, user);
  }
}

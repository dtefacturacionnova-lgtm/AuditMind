import { Controller, Delete, Get, Param, Patch, Post, Put, Body, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { FeesService } from './fees.service';
import { InvoicesService } from './invoices.service';
import { PaymentsService } from './payments.service';
import { CreditNotesService } from './credit-notes.service';
import { WriteOffsService } from './write-offs.service';
import { CollectionNotesService } from './collection-notes.service';
import { CollectionReportsService } from './reports.service';
import {
  AgingQueryDto, StatementQueryDto, SummaryQueryDto, AlertsQueryDto, CreateCollectionNoteDto, ListCollectionNotesQueryDto, ListCreditNotesQueryDto, ListWriteOffsQueryDto, RegisterCreditNoteDto,
  RegisterWriteOffDto, SetItemCompletionDto, SetPromiseStatusDto, UpdateCollectionNoteDto,
} from './dto/collections-3d.dto';
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
    private readonly creditNotes: CreditNotesService,
    private readonly writeOffs: WriteOffsService,
    private readonly collectionNotes: CollectionNotesService,
    private readonly reports: CollectionReportsService,
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

  @Post('schedule/:itemId/completion')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Marcar una cuota (hito) como cumplida o no cumplida: alimenta el devengado por hitos' })
  setItemCompletion(@Param('itemId') id: string, @Body() dto: SetItemCompletionDto, @CurrentUser() user: AuthUser) {
    return this.fees.setItemCompletion(id, dto.completedOn, user);
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

  // ── Notas de crédito (dirección) ───────────────────────────────────────────
  @Post('invoices/:id/credit-notes')
  @Roles(UserRole.CAE)
  @ApiOperation({ summary: 'Registrar una nota de crédito (DTE 05) sobre una factura con saldo (dirección)' })
  registerCreditNote(@Param('id') id: string, @Body() dto: RegisterCreditNoteDto, @CurrentUser() user: AuthUser) {
    return this.creditNotes.register(id, dto, user);
  }

  @Get('credit-notes')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Notas de crédito, con filtros por cliente, factura, encargo y estado' })
  listCreditNotes(@Query() q: ListCreditNotesQueryDto, @CurrentUser() user: AuthUser) {
    return this.creditNotes.list(q, user);
  }

  @Post('credit-notes/:id/void')
  @Roles(UserRole.CAE)
  @ApiOperation({ summary: 'Anular una nota de crédito (dirección, con motivo); se rechaza si dejaría lo facturado por encima del honorario' })
  voidCreditNote(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() user: AuthUser) {
    return this.creditNotes.void(id, dto, user);
  }

  // ── Castigo de incobrables (dirección) ─────────────────────────────────────
  @Post('invoices/:id/write-offs')
  @Roles(UserRole.CAE)
  @ApiOperation({ summary: 'Castigar (total o parcialmente) el saldo de una factura incobrable (dirección)' })
  registerWriteOff(@Param('id') id: string, @Body() dto: RegisterWriteOffDto, @CurrentUser() user: AuthUser) {
    return this.writeOffs.register(id, dto, user);
  }

  @Get('write-offs')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Castigos, con filtros por cliente, factura y estado' })
  listWriteOffs(@Query() q: ListWriteOffsQueryDto, @CurrentUser() user: AuthUser) {
    return this.writeOffs.list(q, user);
  }

  @Post('write-offs/:id/reverse')
  @Roles(UserRole.CAE)
  @ApiOperation({ summary: 'Reversar un castigo (dirección, con motivo): restaura el saldo de la factura' })
  reverseWriteOff(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() user: AuthUser) {
    return this.writeOffs.reverse(id, dto, user);
  }

  // ── Gestión de cobro (gerente o superior) ──────────────────────────────────
  @Post('collection-notes')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Anotar un contacto de cobro: qué se habló, promesa de pago y próximo seguimiento' })
  createCollectionNote(@Body() dto: CreateCollectionNoteDto, @CurrentUser() user: AuthUser) {
    return this.collectionNotes.create(dto, user);
  }

  @Get('collection-notes')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Línea de tiempo de la gestión de cobro, por cliente, factura o encargo' })
  listCollectionNotes(@Query() q: ListCollectionNotesQueryDto, @CurrentUser() user: AuthUser) {
    return this.collectionNotes.list(q, user);
  }

  @Patch('collection-notes/:id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Corregir una nota de gestión (su autor o la dirección; la versión anterior queda en la bitácora)' })
  updateCollectionNote(@Param('id') id: string, @Body() dto: UpdateCollectionNoteDto, @CurrentUser() user: AuthUser) {
    return this.collectionNotes.update(id, dto, user);
  }

  @Patch('collection-notes/:id/promise')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Cambiar el estado de la promesa de pago (pendiente, cumplida, incumplida o cancelada)' })
  setPromiseStatus(@Param('id') id: string, @Body() dto: SetPromiseStatusDto, @CurrentUser() user: AuthUser) {
    return this.collectionNotes.setPromiseStatus(id, dto, user);
  }

  @Delete('collection-notes/:id')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Borrar una nota de gestión (su autor o la dirección; queda en la bitácora)' })
  deleteCollectionNote(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.collectionNotes.remove(id, user);
  }

  @Get('alerts')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Alertas de cobro: promesas vencidas, seguimientos de hoy o atrasados y facturas vencidas sin gestión reciente' })
  alerts(@Query() q: AlertsQueryDto, @CurrentUser() user: AuthUser) {
    return this.collectionNotes.alerts(q, user);
  }

  // ── Reportes (gerente o superior) ──────────────────────────────────────────
  @Get('reports/aging')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Antigüedad de saldos por cliente a una fecha de corte (corriente, 1-30, 31-60, 61-90 y más de 90 días vencidos)' })
  aging(@Query() q: AgingQueryDto, @CurrentUser() user: AuthUser) {
    return this.reports.aging(q, user);
  }

  @Get('clients/:clientId/statement')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Estado de cuenta de un cliente a una fecha de corte, con saldo corrido y facturas abiertas' })
  statement(@Param('clientId') clientId: string, @Query() q: StatementQueryDto, @CurrentUser() user: AuthUser) {
    return this.reports.statement(clientId, q, user);
  }

  @Get('engagements/:engagementId/accrual')
  @Roles(UserRole.AUDIT_MANAGER)
  @ApiOperation({ summary: 'Devengado de un encargo a una fecha de corte: avance, devengado y por facturar (nulo si falta el presupuesto de horas)' })
  async engagementAccrual(@Param('engagementId') id: string, @Query() q: SummaryQueryDto, @CurrentUser() user: AuthUser) {
    return this.fees.accrualAt(id, q.asOf, user);
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

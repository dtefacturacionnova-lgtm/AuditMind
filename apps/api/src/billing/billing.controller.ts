import { Body, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthUser } from '../auth/jwt.strategy';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { BillingUsageService } from './billing-usage.service';
import { CreatePaymentDto } from './dto/billing.dto';
import { MAX_PROOF_BYTES, PaymentsService } from './payments.service';
import { SubscriptionsService } from './subscriptions.service';

/**
 * Lo que ve el CLIENTE: su plan, su consumo en PETICIONES y espacio (nunca dinero ni costos internos), los paquetes que puede comprar y sus pagos.
 * Ver plan y consumo: cualquier usuario de la organización. Comprar, subir comprobantes y cancelar: ADMIN de la organización.
 */
@ApiTags('Facturación')
@ApiBearerAuth()
@Controller('billing')
export class BillingController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly usage: BillingUsageService,
    private readonly payments: PaymentsService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Mi plan: vigencia, módulos, asistentes y límites de mi organización' })
  me(@CurrentUser() user: AuthUser) {
    return this.subscriptions.summaryFor(user.organizationId);
  }

  @Get('usage')
  @ApiOperation({ summary: 'Mi consumo: peticiones de IA (por asistente) y espacio (por tipo de archivo). Sin dinero.' })
  myUsage(@CurrentUser() user: AuthUser) {
    return this.usage.clientSummary(user.organizationId);
  }

  @Get('packs')
  @ApiOperation({ summary: 'Paquetes de peticiones y de espacio que mi plan permite comprar' })
  packs(@CurrentUser() user: AuthUser) {
    return this.payments.packsFor(user.organizationId);
  }

  @Get('payments')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Mis pagos y su estado' })
  myPayments(@CurrentUser() user: AuthUser) {
    return this.payments.listMine(user.organizationId);
  }

  @Post('payments')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Pedir un pago (licencia o paquete): devuelve la referencia única y las instrucciones' })
  createPayment(@Body() dto: CreatePaymentDto, @CurrentUser() user: AuthUser) {
    return this.payments.createRequest({ id: user.id, organizationId: user.organizationId }, dto);
  }

  @Post('payments/:id/proof')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PROOF_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Subir el comprobante de un pago pendiente (PDF, JPG o PNG, hasta 5 MB)' })
  proof(@Param('id') id: string, @UploadedFile() file: { originalname: string; buffer: Buffer } | undefined, @CurrentUser() user: AuthUser) {
    return this.payments.attachProof(user.organizationId, id, file);
  }

  @Post('payments/:id/cancel')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Cancelar un pago pendiente' })
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.payments.cancel(user.organizationId, id);
  }
}

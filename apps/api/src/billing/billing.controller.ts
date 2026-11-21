import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/jwt.strategy';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SubscriptionsService } from './subscriptions.service';

/** Lo que ve el CLIENTE: su plan, su vigencia, sus módulos y sus límites. Nunca costos internos. Cualquier usuario de la organización. */
@ApiTags('Facturación')
@ApiBearerAuth()
@Controller('billing')
export class BillingController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Mi plan: vigencia, módulos, asistentes y límites de mi organización' })
  me(@CurrentUser() user: AuthUser) {
    return this.subscriptions.summaryFor(user.organizationId);
  }
}

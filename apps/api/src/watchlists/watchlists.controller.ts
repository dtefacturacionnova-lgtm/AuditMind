import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole, WatchlistSourceList } from '@prisma/client';
import { IsIn, IsOptional } from 'class-validator';
import { WatchlistsService } from './watchlists.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';

class TriggerSyncBody {
  @IsOptional()
  @IsIn(['OFAC_SDN', 'UN_CONSOLIDATED'])
  sourceList?: WatchlistSourceList;
}

// Motor CAATs #18 — recurso de PLATAFORMA (no de organización): todas las
// organizaciones comparten la misma copia local de OFAC + ONU. Disparar una
// sincronización toca servidores de gobierno externos y afecta a toda la
// plataforma, no solo a quien la dispara — por eso el guard es más estricto
// que ver el estado (mismo criterio ya usado en OrganizationsController).
@ApiTags('Listas de Sanciones — Motor CAATs #18')
@ApiBearerAuth()
@Controller('watchlists')
export class WatchlistsController {
  constructor(private readonly svc: WatchlistsService) {}

  @Get('sync-status')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Estado de sincronización de OFAC/ONU (última corrida + conteos activos)' })
  getSyncStatus() {
    return this.svc.getSyncStatus();
  }

  @Post('sync')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Disparar sincronización manual de OFAC/ONU (omitir sourceList = ambas)' })
  triggerSync(@Body() body: TriggerSyncBody, @CurrentUser() user: AuthUser) {
    return this.svc.triggerSync(body.sourceList, 'MANUAL', user.id);
  }

  @Get('sync/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Detalle de una corrida de sincronización (polling)' })
  getSyncById(@Param('id') id: string) {
    return this.svc.getSyncById(id);
  }
}

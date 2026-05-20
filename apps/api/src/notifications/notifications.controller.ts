import {
  Controller, Get, Patch, Param, Query, ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar notificaciones del usuario' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.service.findAll(user, {
      page:       page ? +page : 1,
      limit:      limit ? +limit : 20,
      unreadOnly: unreadOnly === 'true',
    });
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Conteo de notificaciones no leídas (para badge)' })
  getUnreadCount(@CurrentUser() user: AuthUser) {
    return this.service.getUnreadCount(user);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marcar una notificación como leída' })
  markRead(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.markRead(id, user);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Marcar todas las notificaciones como leídas' })
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.service.markAllRead(user);
  }
}

import { Controller, Post, Body, Get, ForbiddenException, HttpCode, HttpStatus } from '@nestjs/common';
import { InviteUserDto } from './dto/invite-user.dto';
import { assertCanGrantRole } from '../common/utils/tenant.util';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthUser } from './jwt.strategy';

@ApiTags('Auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // ─── Health (público — Railway healthcheck) ───────────────────────────────
  @Get('health')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Health check público (Railway/Vercel)' })
  health() {
    return { status: 'ok', version: '1.0.0', ts: new Date().toISOString() };
  }

  @Get('me')
  @ApiOperation({ summary: 'Obtiene el perfil del usuario autenticado' })
  getMe(@CurrentUser() user: AuthUser) {
    return user;
  }

  // DEV ONLY — bloqueado en producción
  @Post('setup-demo')
  @Public()
  @ApiOperation({ summary: '[DEV ONLY] Sincroniza usuarios demo con Supabase Auth' })
  setupDemo() {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Endpoint deshabilitado en producción');
    }
    return this.authService.setupDemo();
  }

  @Post('invite')
  @Roles('ADMIN', 'CAE')
  @ApiOperation({ summary: 'Invita un nuevo usuario a la organización' })
  inviteUser(
    @Body() dto: InviteUserDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    // Nadie invita con un rol superior al suyo; SUPER_ADMIN solo lo otorga otro SUPER_ADMIN.
    assertCanGrantRole(currentUser, dto.role);
    return this.authService.inviteUser({
      email: dto.email,
      name: dto.name,
      role: dto.role,
      organizationId: currentUser.organizationId,
    });
  }
}

import { Controller, Post, Body, Get, ForbiddenException, HttpCode, HttpStatus } from '@nestjs/common';
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
    @Body() dto: { email: string; name: string; role: string },
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.authService.inviteUser({
      ...dto,
      organizationId: currentUser.organizationId,
    });
  }
}

import { Controller, Post, Body } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { EmailService } from './email.service';

class TestEmailDto {
  to?: string;
}

@ApiTags('Email')
@Controller('email')
export class EmailController {
  constructor(private readonly email: EmailService) {}

  // Antes lo podía usar cualquier usuario con sesión (incluso AUDITEE) hacia cualquier
  // dirección, desde nuestro dominio verificado: auditoría de seguridad 2026-10-18.
  @Post('test')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Enviar email de prueba (verifica configuración Resend)' })
  async sendTest(@Body() dto: TestEmailDto, @CurrentUser() user: AuthUser) {
    const recipient = dto.to ?? user.email;
    return this.email.sendTestEmail(recipient);
  }
}

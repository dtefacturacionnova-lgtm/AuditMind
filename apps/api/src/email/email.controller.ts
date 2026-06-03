import { Controller, Post, Body } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { EmailService } from './email.service';

class TestEmailDto {
  to?: string;
}

@ApiTags('Email')
@Controller('email')
export class EmailController {
  constructor(private readonly email: EmailService) {}

  @Post('test')
  @ApiOperation({ summary: 'Enviar email de prueba (verifica configuración Resend)' })
  async sendTest(@Body() dto: TestEmailDto, @CurrentUser() user: AuthUser) {
    const recipient = dto.to ?? user.email;
    return this.email.sendTestEmail(recipient);
  }
}

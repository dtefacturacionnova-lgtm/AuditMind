import { HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

/** Tope de correos de firma por organización y día (§7): envíos, reenvíos, recordatorios y códigos. Defensa contra spam. */
export const MAX_EMAILS_PER_ORG_PER_DAY = 300;

/**
 * Reglas transversales de la firma por enlace: interruptor general y tope diario de correos.
 *
 * Interruptor: la superficie pública está APAGADA salvo que `SIGNATURES_PUBLIC_ENABLED=true`. Es una decisión
 * explícita: se enciende en el .env del servidor cuando se quiere abrir, y se apaga igual de rápido sin desplegar.
 */
@Injectable()
export class SignaturePolicyService {
  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService) {}

  isEnabled(): boolean {
    return this.config.get<string>('SIGNATURES_PUBLIC_ENABLED') === 'true';
  }

  assertEnabled(): void {
    if (!this.isEnabled()) throw new ServiceUnavailableException('La firma por enlace no está disponible en este momento.');
  }

  /** Clave maestra (ENCRYPTION_KEY): sin ella no se puede cifrar el token ni derivar la clave de los códigos. */
  encryptionKey(): string {
    const key = this.config.get<string>('ENCRYPTION_KEY', '');
    if (!key) throw new ServiceUnavailableException('La firma por enlace no está disponible: falta la clave de cifrado del servidor.');
    return key;
  }

  async assertDailyEmailCap(organizationId: string): Promise<void> {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const sent = await this.prisma.signatureEvent.count({
      where: { type: { in: ['SENT', 'RESENT', 'REMINDER_SENT', 'OTP_SENT'] }, at: { gte: since }, request: { organizationId } },
    });
    if (sent >= MAX_EMAILS_PER_ORG_PER_DAY) {
      throw new HttpException('Se alcanzó el límite diario de correos de firma de tu organización.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}

import { Controller, Get, Header, NotFoundException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { SkipStorageSigning } from '../common/storage/skip-storage-signing.decorator';
import { PublicThrottlerGuard } from '../signatures/public-throttle';
import { PlansService } from './plans.service';

const MINUTE = 60_000;

/** ¿Está publicada la página de precios? Apagada salvo que `PUBLIC_PRICING_ENABLED=true` (decisión del dueño: los precios son hipótesis hasta validarlos). */
export function pricingPublished(value: unknown): boolean {
  return value === 'true';
}

/**
 * Catálogo PÚBLICO de planes para la página /precios (sin sesión). Apagado por defecto: responde 404 hasta que se active
 * `PUBLIC_PRICING_ENABLED=true`. Solo lectura y de lista blanca (public-catalog.ts): sin ids, costos internos ni planes internos.
 *
 * El límite es holgado (120 por minuto y por IP) porque quien consulta es el servidor de la web, que comparte una sola IP por todos los
 * visitantes; la web además guarda la respuesta 60 segundos, así que en la práctica llega ~1 consulta por minuto.
 */
@ApiExcludeController()
@SkipStorageSigning()
@Controller('public/plans')
@UseGuards(PublicThrottlerGuard)
export class PublicPlansController {
  constructor(private readonly plans: PlansService, private readonly config: ConfigService) {}

  @Public() @Get() @Throttle({ default: { limit: 120, ttl: MINUTE } }) @Header('Cache-Control', 'public, max-age=60')
  async catalog() {
    if (!pricingPublished(this.config.get<string>('PUBLIC_PRICING_ENABLED'))) throw new NotFoundException();
    return this.plans.publicCatalog({
      email: this.config.get<string>('SALES_CONTACT_EMAIL'),
      whatsapp: this.config.get<string>('SALES_CONTACT_WHATSAPP'),
    });
  }
}

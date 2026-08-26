import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WatchlistsService } from './watchlists.service';

// Primer uso real de @nestjs/schedule en este código — la dependencia ya
// estaba declarada en package.json pero nunca conectada (confirmado por
// grep antes de construir esto). Diario es un punto de partida razonable,
// no una cadencia calibrada de compliance: OFAC/ONU no publican en un
// calendario fijo.
@Injectable()
export class WatchlistsScheduler {
  private readonly logger = new Logger(WatchlistsScheduler.name);

  constructor(private readonly svc: WatchlistsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleDailySync() {
    this.logger.log('Sincronización diaria de listas de sanciones (OFAC + ONU) — disparada por cron');
    try {
      await this.svc.triggerSync(undefined, 'CRON');
    } catch (err) {
      // triggerSync ya rechaza si hay una corrida en curso (ver
      // WatchlistsService) — no debería pasar con cadencia diaria, pero si
      // una corrida anterior se extendió, no vale la pena que el cron
      // truene con una excepción sin capturar.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Sincronización diaria omitida: ${message}`);
    }
  }
}

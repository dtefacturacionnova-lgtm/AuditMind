import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
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

  // 03:17 y no 03:00 en punto: a las 03:00 arrancan a la vez varios crons de otros
  // proyectos del mismo servidor (backups, firmador, etc.) y las corridas de
  // esta sincronizacion fallaban con "fetch failed" justo a esa hora.
  @Cron('17 3 * * *', { name: 'watchlists-daily-sync' })
  async handleDailySync() {
    this.logger.log('Sincronización diaria de listas de sanciones (OFAC + ONU + UK) — disparada por cron');
    try {
      await this.svc.triggerSync(undefined, 'CRON');
    } catch (err) {
      // triggerSync ya rechaza si hay una corrida en curso (ver
      // WatchlistsService) — no deberia pasar con cadencia diaria, pero si
      // una corrida anterior se extendio, no vale la pena que el cron
      // truene con una excepcion sin capturar.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Sincronización diaria omitida: ${message}`);
    }
  }

  // Red de seguridad semanal (domingo 05:00 UTC): repara cualquier lista cuya
  // ultima sincronizacion exitosa sea mas vieja que WATCHLIST_STALE_AFTER_DAYS.
  @Cron('0 5 * * 0', { name: 'watchlists-weekly-repair' })
  async handleWeeklyRepair() {
    this.logger.log('Verificación semanal de listas de sanciones');
    try {
      const results = await this.svc.repairStale();
      for (const r of results) {
        const age = r.ageDays === null ? 'sin sincronización exitosa' : `${r.ageDays.toFixed(1)} días`;
        this.logger.log(`  ${r.sourceList}: ${age} → ${r.action}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Verificación semanal falló: ${message}`);
    }
  }
}

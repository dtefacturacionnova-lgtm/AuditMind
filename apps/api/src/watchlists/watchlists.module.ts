import { Module } from '@nestjs/common';
import { WatchlistsController } from './watchlists.controller';
import { WatchlistsService } from './watchlists.service';
import { WatchlistsScheduler } from './watchlists.scheduler';

// PrismaModule es @Global() — no hace falta importarlo aquí (mismo criterio
// que el resto de módulos de esta sesión). ScheduleModule.forRoot() se
// registra una sola vez en app.module.ts, no aquí.
@Module({
  controllers: [WatchlistsController],
  providers: [WatchlistsService, WatchlistsScheduler],
})
export class WatchlistsModule {}

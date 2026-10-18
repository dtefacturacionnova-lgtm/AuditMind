import { Injectable, Logger } from '@nestjs/common';
import { ClamAvOptions, pingClamAv, scanWithClamAv, ScanResult } from './clamav.client';

/** Antivirus de adjuntos de terceros. Falla cerrado: ERROR = el archivo no se acepta. */
@Injectable()
export class ClamAvService {
  private readonly logger = new Logger(ClamAvService.name);
  private readonly opts: ClamAvOptions = {
    host: process.env.CLAMAV_HOST || '127.0.0.1',
    port: Number(process.env.CLAMAV_PORT || 3310),
    timeoutMs: Number(process.env.CLAMAV_TIMEOUT_MS || 30_000),
  };

  async scan(data: Buffer): Promise<ScanResult> {
    const result = await scanWithClamAv(data, this.opts);
    if (result.status === 'ERROR') this.logger.error(`ClamAV no pudo escanear el archivo: ${result.error}`);
    return result;
  }

  ping(): Promise<boolean> {
    return pingClamAv(this.opts);
  }
}

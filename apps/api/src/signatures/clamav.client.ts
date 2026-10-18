import { Socket } from 'net';

/**
 * Cliente mínimo del protocolo INSTREAM de clamd (docs/firma-externa-por-enlace.md §12).
 *
 * Protocolo: se envía `zINSTREAM\0`, luego el archivo en bloques con prefijo de 4 bytes
 * (big-endian) con su largo, y al final 4 bytes en cero. clamd responde una línea:
 *   "stream: OK"  |  "stream: <Firma> FOUND"  |  "... ERROR"
 *
 * NUNCA lanza: cualquier fallo (conexión, tiempo, respuesta rara) devuelve ERROR. El que llama
 * debe tratar ERROR como rechazo (falla cerrado): sin escaneo, el archivo no se acepta.
 */
export type ScanResult =
  | { status: 'CLEAN' }
  | { status: 'INFECTED'; signature: string }
  | { status: 'ERROR'; error: string };

export interface ClamAvOptions {
  host: string;
  port: number;
  timeoutMs: number;
}

const CHUNK_SIZE = 64 * 1024;

export function scanWithClamAv(data: Buffer, opts: ClamAvOptions): Promise<ScanResult> {
  return new Promise((resolve) => {
    let settled = false;
    const chunks: Buffer[] = [];
    const socket = new Socket();

    const finish = (result: ScanResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(opts.timeoutMs, () => finish({ status: 'ERROR', error: 'tiempo de espera agotado' }));
    socket.on('error', (err) => finish({ status: 'ERROR', error: `conexión: ${err.message}` }));
    socket.on('data', (d) => chunks.push(d));
    socket.on('close', () => {
      const reply = Buffer.concat(chunks).toString('utf8').replace(/\0/g, '').trim();
      if (/^stream: OK$/.test(reply)) return finish({ status: 'CLEAN' });
      const found = /^stream: (.+) FOUND$/.exec(reply);
      if (found) return finish({ status: 'INFECTED', signature: found[1].slice(0, 200) });
      finish({ status: 'ERROR', error: reply ? `respuesta inesperada: ${reply.slice(0, 120)}` : 'sin respuesta de clamd' });
    });

    socket.connect(opts.port, opts.host, () => {
      socket.write('zINSTREAM\0');
      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const part = data.subarray(i, i + CHUNK_SIZE);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(part.length);
        socket.write(len);
        socket.write(part);
      }
      socket.write(Buffer.alloc(4)); // fin del flujo
    });
  });
}

/** ¿clamd responde? (PING → PONG) */
export function pingClamAv(opts: ClamAvOptions): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let reply = '';
    const socket = new Socket();
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(Math.min(opts.timeoutMs, 5000), () => finish(false));
    socket.on('error', () => finish(false));
    socket.on('data', (d) => { reply += d.toString('utf8'); });
    socket.on('close', () => finish(reply.replace(/\0/g, '').trim() === 'PONG'));
    socket.connect(opts.port, opts.host, () => socket.write('zPING\0'));
  });
}

import { createServer, Server, AddressInfo } from 'net';
import { pingClamAv, scanWithClamAv } from './clamav.client';

/** clamd falso que habla el protocolo INSTREAM de verdad y devuelve lo que le pidamos. */
function fakeClamd(reply: string | null, closeWithoutReply = false) {
  const received: { header: string; payload: Buffer; chunkLengths: number[]; terminated: boolean } = {
    header: '', payload: Buffer.alloc(0), chunkLengths: [], terminated: false,
  };
  const server: Server = createServer((sock) => {
    let buf = Buffer.alloc(0);
    let stage: 'header' | 'chunks' | 'done' = 'header';
    sock.on('error', () => undefined);
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (stage === 'header' && buf.length >= 10) {
        received.header = buf.subarray(0, 10).toString('latin1');
        buf = buf.subarray(10);
        stage = 'chunks';
      }
      while (stage === 'chunks' && buf.length >= 4) {
        const len = buf.readUInt32BE(0);
        if (len === 0) {
          received.terminated = true;
          stage = 'done';
          if (closeWithoutReply) return void sock.end();
          if (reply !== null) sock.end(reply + '\0');
          return; // reply === null: no responde nunca
        }
        if (buf.length < 4 + len) break;
        received.chunkLengths.push(len);
        received.payload = Buffer.concat([received.payload, buf.subarray(4, 4 + len)]);
        buf = buf.subarray(4 + len);
      }
    });
  });
  return new Promise<{ server: Server; port: number; received: typeof received }>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as AddressInfo).port, received })));
}

const close = (s: Server) => new Promise<void>((r) => s.close(() => r()));
const opts = (port: number, timeoutMs = 2000) => ({ host: '127.0.0.1', port, timeoutMs });

describe('cliente ClamAV (INSTREAM)', () => {
  it('archivo limpio → CLEAN, y el protocolo se cumple byte a byte', async () => {
    const { server, port, received } = await fakeClamd('stream: OK');
    const data = Buffer.from(Array.from({ length: 150_000 }, (_, i) => i % 251)); // 3 bloques
    const res = await scanWithClamAv(data, opts(port));
    await close(server);
    expect(res).toEqual({ status: 'CLEAN' });
    expect(received.header).toBe('zINSTREAM\0');
    expect(received.chunkLengths).toEqual([65536, 65536, 18928]);
    expect(received.payload.equals(data)).toBe(true);
    expect(received.terminated).toBe(true);
  });

  it('archivo vacío también termina bien', async () => {
    const { server, port } = await fakeClamd('stream: OK');
    expect(await scanWithClamAv(Buffer.alloc(0), opts(port))).toEqual({ status: 'CLEAN' });
    await close(server);
  });

  it('virus → INFECTED con el nombre de la firma', async () => {
    const { server, port } = await fakeClamd('stream: Win.Test.EICAR_HDB-1 FOUND');
    const res = await scanWithClamAv(Buffer.from('X5O!P%@AP'), opts(port));
    await close(server);
    expect(res).toEqual({ status: 'INFECTED', signature: 'Win.Test.EICAR_HDB-1' });
  });

  it('error de clamd (p. ej. tamaño excedido) → ERROR, nunca CLEAN', async () => {
    const { server, port } = await fakeClamd('INSTREAM size limit exceeded. ERROR');
    const res = await scanWithClamAv(Buffer.from('x'), opts(port));
    await close(server);
    expect(res.status).toBe('ERROR');
  });

  it('clamd que cierra sin responder → ERROR', async () => {
    const { server, port } = await fakeClamd(null, true);
    const res = await scanWithClamAv(Buffer.from('x'), opts(port));
    await close(server);
    expect(res.status).toBe('ERROR');
  });

  it('clamd que no responde nunca → ERROR por tiempo agotado', async () => {
    const { server, port } = await fakeClamd(null);
    const res = await scanWithClamAv(Buffer.from('x'), opts(port, 300));
    await close(server);
    expect(res).toEqual({ status: 'ERROR', error: 'tiempo de espera agotado' });
  });

  it('sin servicio escuchando → ERROR (falla cerrado)', async () => {
    const { server, port } = await fakeClamd('stream: OK');
    await close(server); // el puerto queda libre y sin nadie
    const res = await scanWithClamAv(Buffer.from('x'), opts(port));
    expect(res.status).toBe('ERROR');
  });

  it('una respuesta que intenta pasar por limpia sin serlo no cuenta', async () => {
    const { server, port } = await fakeClamd('stream: OK extra stream: Eicar FOUND');
    const res = await scanWithClamAv(Buffer.from('x'), opts(port));
    await close(server);
    expect(res.status).not.toBe('CLEAN');
  });
});

describe('ping a ClamAV', () => {
  it('PONG → true', async () => {
    const { server, port } = await fakeClamd('PONG');
    // el servidor falso espera INSTREAM; para PING basta con que responda al conectar el primer dato
    const s2 = createServer((sock) => { sock.on('data', () => sock.end('PONG\0')); sock.on('error', () => undefined); });
    await new Promise<void>((r) => s2.listen(0, '127.0.0.1', () => r()));
    const p = (s2.address() as AddressInfo).port;
    expect(await pingClamAv(opts(p))).toBe(true);
    await close(s2);
    await close(server);
  });

  it('sin servicio → false', async () => {
    const { server, port } = await fakeClamd('PONG');
    await close(server);
    expect(await pingClamAv(opts(port))).toBe(false);
  });
});

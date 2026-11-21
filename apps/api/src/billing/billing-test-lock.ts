/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Candado de las pruebas de integración de facturación. Esas suites comparten el interruptor global (`billing_settings.enforcementMode`) y los
 * planes, y Jest corre los archivos en paralelo: sin turnos, una suite que enciende ENFORCE le cambia el escenario a la otra a mitad de una prueba.
 * Se toma un candado de Postgres (a nivel de transacción) que se mantiene mientras dura toda la suite; la otra espera su turno.
 */
export async function acquireBillingTestLock(prisma: any): Promise<() => Promise<void>> {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let acquired!: () => void;
  const gotIt = new Promise<void>((resolve) => { acquired = resolve; });
  const tx: Promise<void> = prisma.$transaction(
    async (t: any) => {
      await t.$executeRawUnsafe('SELECT pg_advisory_xact_lock(884201)');
      acquired();
      await held;
    },
    { timeout: 900_000, maxWait: 900_000 },
  );
  tx.catch(() => acquired()); // si la transacción falla, no dejar esperando a la suite
  await gotIt;
  return async () => { release(); await tx.catch(() => undefined); };
}

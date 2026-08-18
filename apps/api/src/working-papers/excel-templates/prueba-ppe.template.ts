import { Prisma } from '@prisma/client';
import { ExcelTemplateDef, EXCEL_MISMO_PAPEL } from './excel-template.types';

/**
 * Prueba de Propiedad, Planta y Equipo (PPE) — rollforward de costo
 * histórico y depreciación acumulada. Papel base: `PT-FIN-C-SUST` (misma
 * nota de alcance que el resto del catálogo: se muestra en S1 de cualquier
 * instancia de C-SUST, no solo la del área de activo fijo).
 *
 * Contenido inspirado en un workpaper real que compartió el usuario (E240.3
 * Prueba PPE): saldo inicial + adiciones − bajas ± traslados ±
 * reclasificaciones = saldo final, cotejado contra la balanza y contra el
 * cuadro extracontable de activo fijo del cliente.
 *
 * DISEÑO: se evaluó pre-llenar filas automáticamente desde `ctx.saldosTB()`
 * filtrando por `sub_sumaria === 'B-02a'` (el código fijo de "Propiedad,
 * Planta y Equipo" en `paper-consolidation.service.ts`) — descartado a favor
 * del mismo patrón ya probado de `COMPOSICION_CUENTA_TEMPLATE`: tabla LIBRE
 * de trabajo libre, con la hoja "Saldos TB" como referencia de consulta para
 * que el auditor copie el código de cuenta y los saldos inicial/final. Es
 * más simple y evita el riesgo de desincronización entre lo pre-llenado y lo
 * que el auditor termina escribiendo — el cálculo de las diferencias es
 * idéntico de todas formas, sale de lo que el auditor puso en la fila, no de
 * si esa fila se generó sola o se escribió a mano.
 *
 * Dos verificaciones independientes por cuenta (puede fallar una, la otra, o
 * ambas — se documentan juntas si aplica):
 *  1. Movimiento: saldo inicial + adiciones − bajas ± traslados ±
 *     reclasificaciones debe igualar el saldo final según balanza.
 *  2. Saldo final según balanza debe igualar el saldo según el cuadro
 *     extracontable de activo fijo del cliente (columna opcional — se omite
 *     si el auditor no la llena).
 *
 * Fuera de alcance a propósito (v1): el cruce depreciación-del-período vs.
 * gasto de depreciación en el estado de resultados que trae el workpaper de
 * referencia — requiere una cuenta de gasto adicional y es un procedimiento
 * distinto; se puede agregar como plantilla propia si se necesita.
 */

const MARCA_ORIGEN = 'PRUEBA_PPE';

interface FilaRollforward {
  accountCode?: unknown;
  accountName?: unknown;
  saldoInicial?: unknown;
  adiciones?: unknown;
  bajas?: unknown;
  traslados?: unknown;
  reclasificaciones?: unknown;
  saldoFinalBalanza?: unknown;
  saldoCuadroCliente?: unknown;
  comentario?: unknown;
}

export const PRUEBA_PPE_TEMPLATE: ExcelTemplateDef = {
  key: 'PRUEBA_PPE',
  label: 'Prueba de Propiedad, Planta y Equipo',
  descripcion:
    'Rollforward de costo histórico o depreciación acumulada por cuenta (saldo inicial + adiciones − bajas ± traslados ± reclasificaciones) contra el saldo según balanza y, si se completa, contra el cuadro extracontable de activo fijo del cliente. Si el movimiento no cuadra o hay diferencia contra el cuadro del cliente, se registra automáticamente en Diferencias Identificadas (S1).',
  paperCodeAplicable: ['PT-FIN-C-SUST'],
  version: 1,
  hojas: [
    { nombre: 'Rollforward', congelarEn: 'A8', anchoColumnas: [14, 26, 15, 13, 13, 13, 16, 18, 20, 30] },
    { nombre: 'Saldos TB', congelarEn: 'A3', anchoColumnas: [14, 35, 16, 16, 16] },
  ],
  origen: [
    {
      rango: {
        rangoNombre: 'AM_Rollforward', hoja: 'Rollforward', ancla: 'A7', zona: 'LIBRE',
        forma: {
          tipo: 'TABLA',
          columnas: [
            { clave: 'accountCode', encabezado: 'Cuenta', ancho: 14, ayuda: 'Código de la cuenta — consulte la hoja "Saldos TB" para verlas todas.' },
            { clave: 'accountName', encabezado: 'Nombre de la cuenta', ancho: 26 },
            { clave: 'saldoInicial', encabezado: 'Saldo Inicial ($)', ancho: 15, formato: 'MONEDA' },
            { clave: 'adiciones', encabezado: 'Adiciones ($)', ancho: 13, formato: 'MONEDA' },
            { clave: 'bajas', encabezado: 'Bajas ($)', ancho: 13, formato: 'MONEDA' },
            { clave: 'traslados', encabezado: 'Traslados ($)', ancho: 13, formato: 'MONEDA' },
            { clave: 'reclasificaciones', encabezado: 'Reclasificaciones ($)', ancho: 16, formato: 'MONEDA' },
            { clave: 'saldoFinalBalanza', encabezado: 'Saldo Final según Balanza ($)', ancho: 18, formato: 'MONEDA' },
            { clave: 'saldoCuadroCliente', encabezado: 'Saldo según Cuadro del Cliente ($)', ancho: 20, formato: 'MONEDA' },
            { clave: 'comentario', encabezado: 'Comentario', ancho: 30 },
          ],
          filasMinimas: 10, filasMaximas: 300,
        },
        etiqueta: 'Rollforward de costo histórico y depreciación acumulada — una fila por cuenta',
        nota: 'Registre cada cuenta de activo fijo o de su depreciación acumulada por separado. Saldo Inicial y Saldo Final según Balanza deben coincidir con la hoja "Saldos TB" (saldo anterior/actual). "Saldo según Cuadro del Cliente" es opcional — déjelo vacío si no aplica esa verificación.',
      },
    },
    {
      rango: {
        rangoNombre: 'AM_SaldosTB', hoja: 'Saldos TB', ancla: 'A2', zona: 'CONTROLADA',
        forma: {
          tipo: 'TABLA',
          columnas: [
            { clave: 'cuenta',         encabezado: 'Cuenta',         ancho: 14 },
            { clave: 'descripcion',    encabezado: 'Descripción',    ancho: 35 },
            { clave: 'saldo_actual',   encabezado: 'Saldo actual',   ancho: 16, formato: 'MONEDA' },
            { clave: 'saldo_anterior', encabezado: 'Saldo anterior', ancho: 16, formato: 'MONEDA' },
            { clave: 'sub_sumaria',    encabezado: 'Sub-sumaria',    ancho: 14 },
          ],
          filasMinimas: 1, filasMaximas: 800,
        },
        etiqueta: 'Referencia — Balance de Comprobación (B-00). Propiedad, Planta y Equipo = sub-sumaria "B-02a"',
        nota: 'Solo consulta; no se lee de vuelta al subir el archivo',
      },
      fuente: async (ctx) => await ctx.saldosTB(),
    },
  ],
  destino: [
    {
      rangoNombre: 'AM_Rollforward',
      escribeEn: { paperCode: EXCEL_MISMO_PAPEL, sectionKey: 'S1' },
      transformacion: (valorLeido, ctx) => {
        const filas = (valorLeido.tipo === 'TABLA' ? valorLeido.filas : []) as FilaRollforward[];
        const existentes = ctx.filas('S1') as Array<Record<string, unknown>>;
        // Filas de OTRAS fuentes (hallazgos manuales, otras plantillas, evidencia
        // de campo) se conservan intactas — solo se reemplaza lo que ESTA
        // plantilla escribió antes.
        const conservadas = existentes.filter(r => r['_excelOrigen'] !== MARCA_ORIGEN);
        const nuevas: Array<Record<string, unknown>> = [];
        let seq = conservadas.length;

        for (const f of filas) {
          const codigo = String(f.accountCode ?? '').trim();
          if (!codigo) continue; // fila en blanco (relleno de filasMinimas) — no es un error
          const nombre = String(f.accountName ?? '').trim() || codigo;

          const saldoInicial = Number(f.saldoInicial ?? 0) || 0;
          const adiciones = Number(f.adiciones ?? 0) || 0;
          const bajas = Number(f.bajas ?? 0) || 0;
          const traslados = Number(f.traslados ?? 0) || 0;
          const reclasificaciones = Number(f.reclasificaciones ?? 0) || 0;
          const saldoFinalBalanza = Number(f.saldoFinalBalanza ?? 0) || 0;

          const cuadroRaw = f.saldoCuadroCliente;
          const tieneCuadro = cuadroRaw !== null && cuadroRaw !== undefined && cuadroRaw !== '';
          const saldoCuadroCliente = tieneCuadro ? (Number(cuadroRaw) || 0) : 0;

          const movimientoCalculado = saldoInicial + adiciones - bajas + traslados + reclasificaciones;
          const diferenciaMovimiento = movimientoCalculado - saldoFinalBalanza;
          const diferenciaCuadro = saldoFinalBalanza - saldoCuadroCliente;

          const huboMovDif = Math.abs(diferenciaMovimiento) >= 0.01;
          const huboCuadroDif = tieneCuadro && Math.abs(diferenciaCuadro) >= 0.01;
          if (!huboMovDif && !huboCuadroDif) continue; // ambas verificaciones cuadran (o no aplica la 2ª) — nada que reportar

          const partes: string[] = [];
          if (huboMovDif) {
            partes.push(
              `el movimiento calculado (saldo inicial $${saldoInicial.toFixed(2)} + adiciones $${adiciones.toFixed(2)} − bajas $${bajas.toFixed(2)} `
              + `± traslados $${traslados.toFixed(2)} ± reclasificaciones $${reclasificaciones.toFixed(2)} = $${movimientoCalculado.toFixed(2)}) `
              + `no cuadra con el saldo final según balanza ($${saldoFinalBalanza.toFixed(2)})`,
            );
          }
          if (huboCuadroDif) {
            partes.push(
              `el saldo según balanza ($${saldoFinalBalanza.toFixed(2)}) no cuadra con el saldo según el cuadro extracontable del cliente `
              + `($${saldoCuadroCliente.toFixed(2)})`,
            );
          }
          const comentario = String(f.comentario ?? '').trim();

          seq++;
          nuevas.push({
            '_excelOrigen': MARCA_ORIGEN,
            'N°': String(seq),
            'Área/Cuenta': `PPE — ${codigo} ${nombre}`,
            'Descripción de la diferencia':
              `En la cuenta ${codigo} (${nombre}), ${partes.join('; y ')}.` + (comentario ? ` ${comentario}` : ''),
            'Saldo según cliente ($)': (tieneCuadro ? saldoCuadroCliente : saldoFinalBalanza).toFixed(2),
            'Saldo según auditor ($)': (huboMovDif ? movimientoCalculado : saldoFinalBalanza).toFixed(2),
            'Diferencia ($)': (huboMovDif ? diferenciaMovimiento : diferenciaCuadro).toFixed(2),
            'Naturaleza (Error/Estimación/Fraude/No ajustable)': 'Error',
            'Proponer AJE (Sí/No/Pendiente)': 'Pendiente',
          });
        }

        return [...conservadas, ...nuevas] as unknown as Prisma.InputJsonValue;
      },
    },
  ],
};

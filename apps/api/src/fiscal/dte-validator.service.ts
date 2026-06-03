/**
 * DTE Validator — Análisis automático de Documentos Tributarios Electrónicos.
 *
 * Detecta anomalías que el Ministerio de Hacienda (DGII El Salvador) examina
 * en revisiones a contribuyentes:
 *   1. Saltos en el correlativo numérico
 *   2. Emisiones en días no hábiles (sábado, domingo, feriados oficiales SV)
 *   3. Emisiones fuera de horario comercial razonable
 *   4. Duplicados de número o código de generación
 *   5. Anulaciones excesivas (% sobre el total)
 *   6. Concentración inusual de DTEs al cierre de mes (último día > 30%)
 *
 * Referencias:
 *   - Código Tributario SV Art. 107-115 (documentos legales)
 *   - Reglamento Ley DTE (D.E. 144/2022)
 *   - Plan de verificación DGII a dictaminadores fiscales
 */
import { Injectable } from '@nestjs/common';

export interface DteRecord {
  fecha:               string;          // YYYY-MM-DD
  hora?:               string;          // HH:MM:SS
  numeroCorrelativo:   string;          // "DTE-00001234" o "1234"
  tipo?:               string;          // "01" CCF | "03" CF | "04" NR | "07" CFE | etc.
  codigoGeneracion?:   string;          // UUID emitido por MH
  estado?:             'PROCESADO' | 'ANULADO' | 'RECHAZADO' | string;
  monto?:              number | string;
  receptorNit?:        string;
  receptorNombre?:     string;
}

export interface DteAnomaly {
  type:        'CORRELATIVO_SALTO' | 'FIN_DE_SEMANA' | 'FERIADO' | 'FUERA_HORARIO' |
               'DUPLICADO_NUMERO' | 'DUPLICADO_CODIGO' | 'ANULACION_ALTA' |
               'CONCENTRACION_FIN_MES';
  severity:    'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
  affected:    Array<{ correlativo: string; fecha: string; hora?: string; extra?: string }>;
}

export interface DteValidationResult {
  totalRecords:        number;
  validRecords:        number;
  anomalies:           DteAnomaly[];
  summary: {
    correlativosFaltantes:    number;
    emisionesFinDeSemana:     number;
    emisionesEnFeriado:       number;
    emisionesFueraHorario:    number;
    duplicados:               number;
    anuladosPct:              number;
    concentracionUltimoDiaPct: number;
  };
  conformity:          'CLEAN' | 'MINOR_ISSUES' | 'SUSPECT' | 'NON_CONFORMING';
  riskScore:           number;          // 0-100
  recommendation:      string;
}

@Injectable()
export class DteValidatorService {

  // Feriados SV 2026 (oficiales, no incluye vacaciones agostinas variables)
  // El caller puede pasar su propia lista si audita otro año.
  private readonly DEFAULT_HOLIDAYS_SV_2026 = [
    '2026-01-01', // Año Nuevo
    '2026-04-02', // Jueves Santo
    '2026-04-03', // Viernes Santo
    '2026-04-04', // Sábado Santo
    '2026-05-01', // Día del Trabajo
    '2026-05-10', // Día de la Madre
    '2026-06-17', // Día del Padre
    '2026-08-03', // Fiestas Agostinas
    '2026-08-04',
    '2026-08-05',
    '2026-08-06',
    '2026-09-15', // Independencia
    '2026-11-02', // Día de los Difuntos
    '2026-12-25', // Navidad
  ];

  /** Configuración del análisis */
  private readonly HOURS_BUSINESS_START = 6;   // 06:00
  private readonly HOURS_BUSINESS_END   = 22;  // 22:00
  private readonly ANULACION_THRESHOLD  = 5;   // % > 5 → alta
  private readonly CONCENTRATION_THRESHOLD = 30; // % > 30 → concentración inusual

  // ─── Public API ──────────────────────────────────────────────────────────

  validate(records: DteRecord[], holidays?: string[]): DteValidationResult {
    const holidaySet = new Set(holidays ?? this.DEFAULT_HOLIDAYS_SV_2026);

    const anomalies: DteAnomaly[] = [];
    let weekendCount     = 0;
    let holidayCount     = 0;
    let outOfHoursCount  = 0;
    let cancelledCount   = 0;

    // ── Pass 1: per-record checks ─────────────────────────────────────────
    const fechaCounts:   Record<string, number> = {};
    const correlativos:  Map<string, DteRecord[]> = new Map();
    const codigosGen:    Map<string, DteRecord[]> = new Map();

    for (const r of records) {
      const date = new Date(r.fecha + 'T00:00:00');
      const dow  = date.getDay(); // 0=dom, 6=sab

      // Día de semana
      if (dow === 0 || dow === 6) {
        weekendCount++;
      }

      // Feriado
      if (holidaySet.has(r.fecha)) {
        holidayCount++;
      }

      // Horario
      if (r.hora) {
        const hour = parseInt(r.hora.split(':')[0], 10);
        if (Number.isFinite(hour) && (hour < this.HOURS_BUSINESS_START || hour >= this.HOURS_BUSINESS_END)) {
          outOfHoursCount++;
        }
      }

      // Anulados
      if (r.estado === 'ANULADO' || r.estado === 'RECHAZADO') {
        cancelledCount++;
      }

      // Acumular fechas
      fechaCounts[r.fecha] = (fechaCounts[r.fecha] ?? 0) + 1;

      // Acumular correlativos
      const corrKey = r.numeroCorrelativo.trim();
      if (!correlativos.has(corrKey)) correlativos.set(corrKey, []);
      correlativos.get(corrKey)!.push(r);

      // Acumular códigos de generación
      if (r.codigoGeneracion) {
        const codeKey = r.codigoGeneracion.trim().toUpperCase();
        if (!codigosGen.has(codeKey)) codigosGen.set(codeKey, []);
        codigosGen.get(codeKey)!.push(r);
      }
    }

    // ── Pass 2: aggregated anomalies ──────────────────────────────────────

    // 1. Saltos en correlativo (solo si los correlativos son numéricos puros)
    const numericCorrelativos = Array.from(correlativos.keys())
      .map(c => this.extractNumeric(c))
      .filter((n): n is number => Number.isFinite(n))
      .sort((a, b) => a - b);

    const missing: number[] = [];
    if (numericCorrelativos.length >= 3) {
      for (let i = 1; i < numericCorrelativos.length; i++) {
        const gap = numericCorrelativos[i] - numericCorrelativos[i - 1];
        if (gap > 1) {
          // Saltos pequeños son tolerables (otros tipos de doc), grandes no.
          for (let j = numericCorrelativos[i - 1] + 1; j < numericCorrelativos[i]; j++) {
            missing.push(j);
            if (missing.length > 50) break; // cap
          }
        }
        if (missing.length > 50) break;
      }
    }

    if (missing.length > 0) {
      anomalies.push({
        type:        'CORRELATIVO_SALTO',
        severity:    missing.length > 10 ? 'HIGH' : 'MEDIUM',
        description: `Se detectaron ${missing.length} número(s) de correlativo faltante(s) en la serie. Esto puede indicar DTEs anulados sin documentar o emisiones fuera del sistema.`,
        affected:    missing.slice(0, 20).map(n => ({
          correlativo: String(n),
          fecha:       '',
          extra:       'Número faltante',
        })),
      });
    }

    // 2. Fin de semana
    if (weekendCount > 0) {
      const examples = records
        .filter(r => { const d = new Date(r.fecha + 'T00:00:00'); return d.getDay() === 0 || d.getDay() === 6; })
        .slice(0, 10);
      anomalies.push({
        type:        'FIN_DE_SEMANA',
        severity:    weekendCount > records.length * 0.15 ? 'HIGH' : weekendCount > 5 ? 'MEDIUM' : 'LOW',
        description: `${weekendCount} DTE(s) emitido(s) en sábado o domingo. Verificar si la actividad lo justifica (comercio retail, restaurantes) o si son emisiones retroactivas.`,
        affected:    examples.map(r => ({ correlativo: r.numeroCorrelativo, fecha: r.fecha, hora: r.hora })),
      });
    }

    // 3. Feriados
    if (holidayCount > 0) {
      const examples = records.filter(r => holidaySet.has(r.fecha)).slice(0, 10);
      anomalies.push({
        type:        'FERIADO',
        severity:    'MEDIUM',
        description: `${holidayCount} DTE(s) emitido(s) en feriado oficial SV. Revisar si la operación amerita actividad ese día.`,
        affected:    examples.map(r => ({ correlativo: r.numeroCorrelativo, fecha: r.fecha, hora: r.hora })),
      });
    }

    // 4. Fuera de horario
    if (outOfHoursCount > 0) {
      const examples = records.filter(r => {
        if (!r.hora) return false;
        const hr = parseInt(r.hora.split(':')[0], 10);
        return Number.isFinite(hr) && (hr < this.HOURS_BUSINESS_START || hr >= this.HOURS_BUSINESS_END);
      }).slice(0, 10);
      anomalies.push({
        type:        'FUERA_HORARIO',
        severity:    outOfHoursCount > records.length * 0.1 ? 'HIGH' : 'LOW',
        description: `${outOfHoursCount} DTE(s) emitido(s) fuera del horario comercial (06:00-22:00). Posible indicador de manipulación.`,
        affected:    examples.map(r => ({ correlativo: r.numeroCorrelativo, fecha: r.fecha, hora: r.hora })),
      });
    }

    // 5. Duplicados de correlativo
    const dupCorrelativos = Array.from(correlativos.entries()).filter(([, v]) => v.length > 1);
    if (dupCorrelativos.length > 0) {
      anomalies.push({
        type:        'DUPLICADO_NUMERO',
        severity:    'HIGH',
        description: `${dupCorrelativos.length} correlativo(s) duplicado(s). Cada DTE debe tener número único.`,
        affected:    dupCorrelativos.slice(0, 10).map(([num, recs]) => ({
          correlativo: num,
          fecha:       recs[0].fecha,
          extra:       `${recs.length} ocurrencias`,
        })),
      });
    }

    // 6. Duplicados de código de generación
    const dupCodigos = Array.from(codigosGen.entries()).filter(([, v]) => v.length > 1);
    if (dupCodigos.length > 0) {
      anomalies.push({
        type:        'DUPLICADO_CODIGO',
        severity:    'HIGH',
        description: `${dupCodigos.length} código(s) de generación duplicado(s). El código emitido por MH es único por DTE.`,
        affected:    dupCodigos.slice(0, 10).map(([code, recs]) => ({
          correlativo: recs[0].numeroCorrelativo,
          fecha:       recs[0].fecha,
          extra:       `Código: ${code.slice(0, 16)}…`,
        })),
      });
    }

    // 7. % de anulaciones
    const anuladosPct = records.length > 0 ? (cancelledCount / records.length) * 100 : 0;
    if (anuladosPct > this.ANULACION_THRESHOLD) {
      anomalies.push({
        type:        'ANULACION_ALTA',
        severity:    anuladosPct > 15 ? 'HIGH' : 'MEDIUM',
        description: `${anuladosPct.toFixed(1)}% de DTEs anulados (umbral: ${this.ANULACION_THRESHOLD}%). Alto índice puede indicar uso inadecuado del sistema o intentos de manipulación.`,
        affected:    records.filter(r => r.estado === 'ANULADO').slice(0, 10).map(r => ({
          correlativo: r.numeroCorrelativo, fecha: r.fecha, hora: r.hora,
        })),
      });
    }

    // 8. Concentración último día del mes
    const lastDayCounts = this.concentrationLastDay(fechaCounts, records.length);
    if (lastDayCounts.pct > this.CONCENTRATION_THRESHOLD) {
      anomalies.push({
        type:        'CONCENTRACION_FIN_MES',
        severity:    lastDayCounts.pct > 50 ? 'HIGH' : 'MEDIUM',
        description: `${lastDayCounts.pct.toFixed(1)}% de DTEs emitidos en el último día del mes. Concentración inusual sugiere posible regularización tardía.`,
        affected:    lastDayCounts.dates.map(d => ({ correlativo: '', fecha: d, extra: `${fechaCounts[d]} DTEs` })),
      });
    }

    // ── Score + clasificación ────────────────────────────────────────────
    const riskScore = Math.min(100,
      missing.length * 0.5 +
      Math.min(40, weekendCount * 1.2) +
      holidayCount * 2 +
      Math.min(20, outOfHoursCount * 0.8) +
      dupCorrelativos.length * 8 +
      dupCodigos.length * 10 +
      anuladosPct * 1.5 +
      (lastDayCounts.pct > this.CONCENTRATION_THRESHOLD ? 10 : 0)
    );

    const conformity = riskScore < 15 ? 'CLEAN' :
                       riskScore < 35 ? 'MINOR_ISSUES' :
                       riskScore < 65 ? 'SUSPECT' :
                       'NON_CONFORMING';

    const recommendation = this.buildRecommendation(conformity, anomalies);

    return {
      totalRecords:  records.length,
      validRecords:  records.length - cancelledCount,
      anomalies,
      summary: {
        correlativosFaltantes:    missing.length,
        emisionesFinDeSemana:     weekendCount,
        emisionesEnFeriado:       holidayCount,
        emisionesFueraHorario:    outOfHoursCount,
        duplicados:               dupCorrelativos.length + dupCodigos.length,
        anuladosPct:              Math.round(anuladosPct * 100) / 100,
        concentracionUltimoDiaPct: Math.round(lastDayCounts.pct * 100) / 100,
      },
      conformity,
      riskScore:     Math.round(riskScore * 10) / 10,
      recommendation,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private extractNumeric(s: string): number {
    const match = s.match(/\d+/g);
    if (!match) return NaN;
    // Usar la concatenación de números → e.g. "DTE-001-00001234" → 100001234
    return parseInt(match.join(''), 10);
  }

  private concentrationLastDay(
    fechaCounts: Record<string, number>,
    total: number,
  ): { pct: number; dates: string[] } {
    // Agrupar por mes y ver qué porcentaje cae en el último día con emisiones
    const monthLastDays = new Map<string, string>(); // YYYY-MM → "YYYY-MM-DD"
    const monthCounts   = new Map<string, number>();
    const lastDayCounts = new Map<string, number>();

    for (const [date, count] of Object.entries(fechaCounts)) {
      const month = date.slice(0, 7);
      monthCounts.set(month, (monthCounts.get(month) ?? 0) + count);

      const prev = monthLastDays.get(month);
      if (!prev || date > prev) {
        monthLastDays.set(month, date);
      }
    }

    for (const [month, lastDay] of monthLastDays) {
      lastDayCounts.set(month, fechaCounts[lastDay] ?? 0);
    }

    const totalLastDay = Array.from(lastDayCounts.values()).reduce((a, b) => a + b, 0);
    const pct = total > 0 ? (totalLastDay / total) * 100 : 0;
    const dates = Array.from(monthLastDays.values()).slice(0, 6);

    return { pct, dates };
  }

  private buildRecommendation(conformity: string, anomalies: DteAnomaly[]): string {
    if (conformity === 'CLEAN') {
      return 'La emisión de DTEs en el período auditado no presenta anomalías significativas. Continuar con procedimientos sustantivos estándar.';
    }
    if (conformity === 'MINOR_ISSUES') {
      return 'Anomalías menores detectadas. Documentar las excepciones, indagar con el contribuyente, y ampliar muestra de revisión en las áreas afectadas.';
    }
    if (conformity === 'SUSPECT') {
      const topTypes = anomalies.filter(a => a.severity === 'HIGH').map(a => a.type).slice(0, 3);
      return `Anomalías significativas en: ${topTypes.join(', ')}. Profundizar pruebas sustantivas sobre las transacciones señaladas. Considerar comunicar a la Gerencia y documentar en papel de hallazgo.`;
    }
    return 'Anomalías graves detectadas que sugieren manipulación de la emisión de DTEs o uso inadecuado del sistema. Recomendar al equipo: (1) Aplicar procedimientos forenses (NIA 240). (2) Considerar ampliación del alcance a períodos previos. (3) Comunicar inmediatamente al Socio Responsable y al Comité de Auditoría.';
  }
}

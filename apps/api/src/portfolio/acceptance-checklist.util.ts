/**
 * Verificaciones previas a la aceptación de un cliente (Radar de Aceptación, NIA 220 / ISQM 1 / Código IESBA).
 * Viven en el campo `checklist` del Radar (sin columnas nuevas): tres ítems fijos que el servidor siembra, valida y exige, más los
 * ítems libres que un Radar antiguo ya pudiera traer.
 *
 * Cada ítem fijo se resuelve de una de dos maneras, siempre con un texto que lo respalde:
 *  - «Hecho»: qué se hizo y qué se encontró (la comunicación con el auditor predecesor además lleva la fecha de la solicitud).
 *  - «No aplica»: el motivo (por ejemplo, un cliente de continuidad no tiene auditor predecesor).
 * Decidir el Radar en Verde o Amarillo exige que los tres estén resueltos; declinar al cliente (Rojo) no.
 *
 * La comunicación con el auditor predecesor «Hecha» lleva además su REGISTRO estructurado (NIA 300 y Código IESBA 320): a quién se le
 * escribió, que el cliente autorizó la comunicación, la fecha de la solicitud, el resultado y la fecha de la respuesta.
 */
export type ChecklistStatus = 'PENDING' | 'DONE' | 'NOT_APPLICABLE';

/** Resultado de la comunicación con el auditor predecesor. */
export type PredecessorOutcome = 'NO_MATTERS' | 'MATTERS_NOTED' | 'NO_RESPONSE';
export const PREDECESSOR_OUTCOMES: PredecessorOutcome[] = ['NO_MATTERS', 'MATTERS_NOTED', 'NO_RESPONSE'];

export interface ChecklistItem {
  key?: string;
  item: string;
  status?: ChecklistStatus;
  /** Fecha de la solicitud al auditor predecesor (YYYY-MM-DD). */
  date?: string;
  answer?: string;
  comment?: string;
  /** Solo PREDECESSOR «Hecho»: auditor o firma predecesora a quien se le escribió. */
  predecessorFirm?: string;
  /** Solo PREDECESSOR «Hecho»: el cliente autorizó la comunicación con su auditor anterior. */
  clientAuthorized?: boolean;
  /** Solo PREDECESSOR «Hecho»: cómo terminó la comunicación. */
  outcome?: PredecessorOutcome;
  /** Solo PREDECESSOR «Hecho» con respuesta: fecha en que respondió (YYYY-MM-DD). */
  responseDate?: string;
}

export const MIN_CHECKLIST_COMMENT = 10;

export const CHECKLIST_TEMPLATE: ReadonlyArray<{ key: string; item: string; short: string; needsDate?: boolean }> = [
  {
    key: 'PREDECESSOR',
    short: 'Comunicación con el auditor predecesor',
    needsDate: true,
    item: 'Comunicación con el auditor predecesor (NIA 300, Código IESBA): solicitud con autorización del cliente, fecha de la solicitud y respuesta recibida.',
  },
  {
    key: 'CONFLICTS',
    short: 'Conflictos de interés del socio y el equipo',
    item: 'Conflictos de interés revisados para el socio, el equipo y sus familiares cercanos: intereses financieros y relaciones personales o de negocio con el cliente.',
  },
  {
    key: 'PRIOR_SERVICES',
    short: 'Servicios previos al cliente',
    item: 'Servicios previos o simultáneos prestados al cliente evaluados frente a las amenazas a la independencia (autorrevisión, interés propio, familiaridad).',
  },
];

export const CHECKLIST_KEYS = CHECKLIST_TEMPLATE.map((t) => t.key);

const STATUSES: ChecklistStatus[] = ['PENDING', 'DONE', 'NOT_APPLICABLE'];
const asList = (v: unknown): ChecklistItem[] => (Array.isArray(v) ? (v as ChecklistItem[]).filter((i) => i && typeof i === 'object') : []);
const clean = (o: ChecklistItem): ChecklistItem => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')) as unknown as ChecklistItem;

/**
 * Checklist completo del Radar: los tres ítems fijos (con el texto del servidor, nunca el que mande el cliente) y después los
 * ítems libres. `incoming` pisa a `stored` ítem por ítem. Un cliente de continuidad (el despacho ya fue su auditor) trae el ítem del
 * auditor predecesor como «No aplica» desde el inicio, con la constancia de por qué.
 */
export function mergeChecklist(stored: unknown, incoming?: unknown, opts: { continuityYear?: number | null } = {}): ChecklistItem[] {
  const storedList = asList(stored);
  const incomingList = incoming === undefined || incoming === null ? null : asList(incoming);
  const byKey = new Map<string, ChecklistItem>();
  for (const it of storedList) if (it.key) byKey.set(it.key, it);
  if (incomingList) for (const it of incomingList) if (it.key) byKey.set(it.key, { ...byKey.get(it.key), ...it });

  const fixed = CHECKLIST_TEMPLATE.map((t) => {
    const base = byKey.get(t.key);
    if (base) {
      const status = STATUSES.includes(base.status as ChecklistStatus) ? (base.status as ChecklistStatus) : 'PENDING';
      // El registro del auditor predecesor solo se conserva cuando la comunicación está «Hecha».
      const record = t.key === 'PREDECESSOR' && status === 'DONE'
        ? {
          predecessorFirm: typeof base.predecessorFirm === 'string' ? base.predecessorFirm.trim() : undefined,
          clientAuthorized: typeof base.clientAuthorized === 'boolean' ? base.clientAuthorized : undefined,
          outcome: PREDECESSOR_OUTCOMES.includes(base.outcome as PredecessorOutcome) ? base.outcome : undefined,
          responseDate: base.outcome === 'NO_RESPONSE' ? undefined : base.responseDate,
        }
        : {};
      return clean({ key: t.key, item: t.item, status, date: base.date, answer: base.answer, comment: base.comment, ...record });
    }
    if (t.key === 'PREDECESSOR' && opts.continuityYear) {
      return clean({
        key: t.key, item: t.item, status: 'NOT_APPLICABLE',
        comment: `Cliente de continuidad: el despacho ya fue su auditor en el ejercicio ${opts.continuityYear}.`,
      });
    }
    return clean({ key: t.key, item: t.item, status: 'PENDING' });
  });
  const free = (incomingList ?? storedList).filter((i) => !i.key).map(clean);
  return [...fixed, ...free];
}

export interface ChecklistReview {
  /** Ítems con datos incompletos o inválidos (siempre se rechazan, aunque sea un borrador). */
  invalid: string[];
  /** Ítems todavía sin resolver (solo impiden decidir en Verde o Amarillo). */
  pending: string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function reviewChecklist(list: ChecklistItem[], today: Date = new Date()): ChecklistReview {
  const invalid: string[] = [];
  const pending: string[] = [];
  for (const t of CHECKLIST_TEMPLATE) {
    const it = list.find((i) => i.key === t.key);
    const status = it?.status ?? 'PENDING';
    if (status === 'PENDING') { pending.push(t.short); continue; }
    const comment = (it?.comment ?? '').trim();
    if (comment.length < MIN_CHECKLIST_COMMENT) {
      invalid.push(`«${t.short}»: ${status === 'DONE' ? 'describe qué se hizo y qué se encontró' : 'indica por qué no aplica'} (mínimo ${MIN_CHECKLIST_COMMENT} caracteres).`);
    }
    if (t.needsDate && status === 'DONE') {
      if (!it?.date || !ISO_DATE.test(it.date) || Number.isNaN(Date.parse(it.date))) {
        invalid.push(`«${t.short}»: indica la fecha de la solicitud.`);
      } else if (Date.parse(it.date) > today.getTime() + 24 * 3600 * 1000) {
        invalid.push(`«${t.short}»: la fecha de la solicitud no puede ser futura.`);
      }
    }
    if (t.key === 'PREDECESSOR' && status === 'DONE') {
      if ((it?.predecessorFirm ?? '').trim().length < 3) invalid.push(`«${t.short}»: indica el auditor o la firma predecesora a quien se le escribió.`);
      if (it?.clientAuthorized !== true) invalid.push(`«${t.short}»: confirma que el cliente autorizó la comunicación con su auditor anterior (Código IESBA 320).`);
      if (!it?.outcome || !PREDECESSOR_OUTCOMES.includes(it.outcome)) {
        invalid.push(`«${t.short}»: indica el resultado (sin asuntos, con asuntos señalados o sin respuesta).`);
      } else if (it.outcome !== 'NO_RESPONSE') {
        const reqOk = !!it.date && ISO_DATE.test(it.date) && !Number.isNaN(Date.parse(it.date));
        if (!it.responseDate || !ISO_DATE.test(it.responseDate) || Number.isNaN(Date.parse(it.responseDate))) {
          invalid.push(`«${t.short}»: indica la fecha de la respuesta del auditor predecesor.`);
        } else if (Date.parse(it.responseDate) > today.getTime() + 24 * 3600 * 1000) {
          invalid.push(`«${t.short}»: la fecha de la respuesta no puede ser futura.`);
        } else if (reqOk && Date.parse(it.responseDate) < Date.parse(it.date as string)) {
          invalid.push(`«${t.short}»: la respuesta no puede ser anterior a la solicitud.`);
        }
      }
    }
  }
  return { invalid, pending };
}

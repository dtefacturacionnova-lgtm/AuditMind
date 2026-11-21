import {
  fileSizeText, isAssistantIncluded, isEnforcing, isIncluded, isLocked, isPlanActive, isReadOnlyAccount, limitText, parseEntitlementKey,
  visibleNotice, type BillingMe,
} from './access';

const base: BillingMe = {
  organization: { id: 'o1', name: 'Despacho' },
  enforcementMode: 'ENFORCE',
  hasSubscription: true,
  plan: { code: 'EMPRESA_DESPACHO', name: 'Empresa Despacho', audience: 'EMPRESA' },
  status: 'ACTIVE', readOnly: false, exempt: false, months: 12,
  endsAt: '2027-01-01T00:00:00.000Z', graceEndsAt: null, daysLeft: 40,
  modules: ['CARTERA', 'HORAS'], functions: ['FIRMA'], assistants: ['ARGUS', 'FISCUS'],
  limits: null, seats: { used: 2, allowed: 5 },
  notice: { level: 'warning', code: 'EXPIRING', message: 'Tu licencia vence en 5 día(s).' },
};
const me = (patch: Partial<BillingMe> = {}): BillingMe => ({ ...base, ...patch });

describe('el plan solo aplica con el interruptor encendido', () => {
  it('con el interruptor apagado nada se bloquea ni se avisa, aunque falten módulos', () => {
    const off = me({ enforcementMode: 'OFF' });
    expect(isPlanActive(off)).toBe(false);
    expect(isLocked(off, 'GOBIERNO')).toBe(false);
    expect(isIncluded(off, 'GOBIERNO')).toBe(true);
    expect(isAssistantIncluded(off, 'ATLAS')).toBe(true);
    expect(visibleNotice(off)).toBeNull();
    expect(isReadOnlyAccount(me({ enforcementMode: 'OFF', readOnly: true }))).toBe(false);
  });

  it('exenta (Piloto/Interno) o sin suscripción: todo abierto', () => {
    expect(isLocked(me({ exempt: true }), 'GOBIERNO')).toBe(false);
    expect(isLocked(me({ hasSubscription: false, exempt: true, modules: [] }), 'GOBIERNO')).toBe(false);
    expect(visibleNotice(me({ exempt: true }))).toBeNull();
  });

  it('si no se pudo leer el plan, todo queda abierto (falla abierta)', () => {
    expect(isPlanActive(null)).toBe(false);
    expect(isPlanActive(undefined)).toBe(false);
    expect(isLocked(null, 'CARTERA')).toBe(false);
    expect(isLocked(undefined, 'GOBIERNO')).toBe(false);
    expect(isAssistantIncluded(null, 'ATLAS')).toBe(true);
    expect(visibleNotice(null)).toBeNull();
  });

  it('un modo desconocido tampoco bloquea', () => {
    expect(isPlanActive(me({ enforcementMode: 'OTRO' as never }))).toBe(false);
  });

  it('con OBSERVE o ENFORCE y sin exención se muestran candados y avisos', () => {
    for (const mode of ['OBSERVE', 'ENFORCE'] as const) {
      const m = me({ enforcementMode: mode });
      expect(isPlanActive(m)).toBe(true);
      expect(isLocked(m, 'GOBIERNO')).toBe(true);
      expect(isLocked(m, 'CARTERA')).toBe(false);
      expect(visibleNotice(m)?.code).toBe('EXPIRING');
    }
  });

  it('solo ENFORCE bloquea de verdad', () => {
    expect(isEnforcing(me({ enforcementMode: 'ENFORCE' }))).toBe(true);
    expect(isEnforcing(me({ enforcementMode: 'OBSERVE' }))).toBe(false);
    expect(isEnforcing(me({ enforcementMode: 'OFF' }))).toBe(false);
    expect(isEnforcing(me({ enforcementMode: 'ENFORCE', exempt: true }))).toBe(false);
  });
});

describe('módulos, funciones y asistentes incluidos', () => {
  it('una función incluida cuenta igual que un módulo', () => {
    expect(isIncluded(base, 'FIRMA')).toBe(true);
    expect(isIncluded(base, 'FORENSE')).toBe(false);
    expect(isIncluded(base, 'HORAS')).toBe(true);
  });

  it('lo que no tiene clave (núcleo) nunca se bloquea', () => {
    expect(isLocked(base, null)).toBe(false);
    expect(isLocked(base, undefined)).toBe(false);
  });

  it('el asistente se compara sin importar mayúsculas', () => {
    expect(isAssistantIncluded(base, 'fiscus')).toBe(true);
    expect(isAssistantIncluded(base, 'ATLAS')).toBe(false);
  });

  it('una respuesta malformada (sin listas) no rompe nada', () => {
    const bad = me({ modules: undefined as never, functions: null as never });
    expect(isLocked(bad, 'CARTERA')).toBe(false); // no se pudo leer el plan: falla abierta
    expect(isAssistantIncluded(me({ assistants: undefined as never }), 'ARGUS')).toBe(true);
    // una lista vacía bien formada sí es un plan sin módulos: el servidor también bloquearía
    expect(isLocked(me({ modules: [], functions: [] }), 'CARTERA')).toBe(true);
  });
});

describe('solo lectura y avisos', () => {
  it('solo lectura se reconoce solo si el plan aplica', () => {
    expect(isReadOnlyAccount(me({ readOnly: true }))).toBe(true);
    expect(isReadOnlyAccount(me({ readOnly: false }))).toBe(false);
    expect(isReadOnlyAccount(me({ readOnly: true, exempt: true }))).toBe(false);
  });

  it('descarta un aviso sin mensaje', () => {
    expect(visibleNotice(me({ notice: { level: 'info', code: 'X', message: '' } }))).toBeNull();
    expect(visibleNotice(me({ notice: null }))).toBeNull();
  });
});

describe('claves y textos', () => {
  it('solo acepta claves conocidas de la URL', () => {
    expect(parseEntitlementKey('CARTERA')).toBe('CARTERA');
    expect(parseEntitlementKey('FORENSE')).toBe('FORENSE');
    expect(parseEntitlementKey('<script>')).toBeNull();
    expect(parseEntitlementKey(undefined)).toBeNull();
    expect(parseEntitlementKey('cartera')).toBeNull();
  });

  it('muestra los límites; -1 es «Sin tope»', () => {
    expect(limitText(5000)).toBe('5,000');
    expect(limitText(100, 'GB')).toBe('100 GB');
    expect(limitText(-1, 'GB')).toBe('Sin tope');
    expect(limitText(null)).toBe('—');
    expect(fileSizeText(500)).toBe('500 MB');
    expect(fileSizeText(2048)).toBe('2 GB');
    expect(fileSizeText(1500)).toBe('1,500 MB');
    expect(fileSizeText(-1)).toBe('Sin tope');
  });
});

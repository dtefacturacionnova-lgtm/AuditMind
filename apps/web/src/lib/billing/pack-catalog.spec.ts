import type { AdminPackRow } from './admin-types';
import {
  LOW_MARGIN_PCT, PACK_PRICE_MAX, PACK_QUANTITY_MAX, activeCoverage, buildCreateBody, buildUpdateBody, emptyPackForm, nextSortOrder, normalizeCode, packEconomics,
  packPreview, packToForm, packWarnings, parsePackPrice, parseQuantity, parseSortOrder, pendingByPack, quantityLockText, sortPacks, suggestPackCode, suggestPackName,
  validatePackForm, type PackFormState,
} from './pack-catalog';

const pack = (over: Partial<AdminPackRow> = {}): AdminPackRow => ({
  id: 'p1', code: 'AI_1000', kind: 'AI', name: '+1,000 peticiones de IA', quantity: 1000, priceUsd: '5.00', recurring: false, active: true, sortOrder: 10, ...over,
});
const form = (over: Partial<PackFormState> = {}): PackFormState => ({
  kind: 'AI', code: 'AI_2000', name: '+2,000 peticiones de IA', quantity: '2000', price: '9', sortOrder: '15', active: true, ...over,
});

describe('lectura de números', () => {
  it('cantidad: entero de 1 a 100,000,000, con o sin comas de miles', () => {
    expect(parseQuantity('1000')).toBe(1000);
    expect(parseQuantity(' 1,000 ')).toBe(1000);
    expect(parseQuantity('20,000')).toBe(20000);
    expect(parseQuantity(String(PACK_QUANTITY_MAX))).toBe(PACK_QUANTITY_MAX);
    for (const bad of ['0', '-5', '1.5', 'diez', '', '  ', String(PACK_QUANTITY_MAX + 1), '1,00', '12345678901']) expect(parseQuantity(bad)).toBeNull();
  });
  it('precio: de 0 a 9,999,999 con hasta 2 decimales, con «$» y comas', () => {
    expect(parsePackPrice('5')).toBe(5);
    expect(parsePackPrice('$19.50')).toBe(19.5);
    expect(parsePackPrice('1,200.5')).toBe(1200.5);
    expect(parsePackPrice('0')).toBe(0);
    expect(parsePackPrice(String(PACK_PRICE_MAX))).toBe(PACK_PRICE_MAX);
    for (const bad of ['-1', '1.234', 'gratis', '', String(PACK_PRICE_MAX + 1), '99999999']) expect(parsePackPrice(bad)).toBeNull();
  });
  it('orden: entero de 0 a 1000', () => {
    expect(parseSortOrder('0')).toBe(0);
    expect(parseSortOrder(' 70 ')).toBe(70);
    expect(parseSortOrder('1000')).toBe(1000);
    for (const bad of ['1001', '-1', '1.5', '', 'x']) expect(parseSortOrder(bad)).toBeNull();
  });
});

describe('sugerencias de nombre y código', () => {
  it('coinciden con los paquetes de fábrica', () => {
    expect(suggestPackName('AI', 1000)).toBe('+1,000 peticiones de IA');
    expect(suggestPackName('AI', 20000)).toBe('+20,000 peticiones de IA');
    expect(suggestPackName('STORAGE', 50)).toBe('+50 GB de espacio');
    expect(suggestPackName('STORAGE', 1000)).toBe('+1 TB de espacio');
    expect(suggestPackCode('AI', 5000)).toBe('AI_5000');
    expect(suggestPackCode('STORAGE', 200)).toBe('STORAGE_200');
  });
  it('sin cantidad válida no sugieren nada', () => {
    expect(suggestPackName('AI', null)).toBe('');
    expect(suggestPackCode('STORAGE', null)).toBe('');
  });
});

describe('formulario', () => {
  it('uno nuevo parte vacío y activo, con el orden dado', () => {
    expect(emptyPackForm('STORAGE', 80)).toEqual({ kind: 'STORAGE', code: '', name: '', quantity: '', price: '', sortOrder: '80', active: true });
  });
  it('de un paquete de la base: el precio llega como texto Decimal y vuelve como número limpio', () => {
    expect(packToForm(pack({ priceUsd: '12.00', quantity: 50, kind: 'STORAGE', code: 'STORAGE_50' }))).toMatchObject({ kind: 'STORAGE', price: '12', quantity: '50', sortOrder: '10', active: true });
    expect(packToForm(pack({ priceUsd: '19.50' })).price).toBe('19.5');
    expect(packToForm(pack({ priceUsd: 'raro' as never })).price).toBe('');
    expect(packToForm(pack({ active: false })).active).toBe(false);
  });
  it('el orden siguiente va al final, de 10 en 10, sin pasar de 1000', () => {
    expect(nextSortOrder([])).toBe(10);
    expect(nextSortOrder([{ sortOrder: 40 }, { sortOrder: 70 }, { sortOrder: 20 }])).toBe(80);
    expect(nextSortOrder([{ sortOrder: 995 }])).toBe(1000);
    expect(nextSortOrder([{ sortOrder: Number.NaN }])).toBe(10);
  });
});

describe('validatePackForm', () => {
  it('un formulario correcto no tiene errores', () => {
    expect(validatePackForm(form(), 'create', ['AI_1000'])).toEqual({});
    expect(validatePackForm(form({ code: '' }), 'update')).toEqual({}); // el código solo se valida al crear
  });
  it('código: 3 a 40 letras, números o guion bajo; se acepta en minúsculas porque el API lo pasa a mayúsculas', () => {
    expect(validatePackForm(form({ code: 'ai_2000' }), 'create').code).toBeUndefined();
    for (const bad of ['', 'ab', 'AI 2000', 'AÍ_2000', 'AI-2000', 'x'.repeat(41)]) expect(validatePackForm(form({ code: bad }), 'create').code).toBeDefined();
  });
  it('código repetido (sin importar mayúsculas, ni lo que se escribe ni lo que ya existe)', () => {
    expect(validatePackForm(form({ code: 'ai_1000' }), 'create', ['AI_1000']).code).toBe('Ya existe el paquete AI_1000.');
    expect(validatePackForm(form({ code: 'AI_1000' }), 'create', ['ai_1000']).code).toBe('Ya existe el paquete AI_1000.');
    expect(validatePackForm(form({ code: 'AI_1001' }), 'create', ['AI_1000']).code).toBeUndefined();
  });
  it('nombre: obligatorio y de hasta 120 caracteres', () => {
    expect(validatePackForm(form({ name: '   ' }), 'create').name).toBeDefined();
    expect(validatePackForm(form({ name: 'x'.repeat(120) }), 'create').name).toBeUndefined();
    expect(validatePackForm(form({ name: 'x'.repeat(121) }), 'create').name).toContain('121');
  });
  it('cantidad, precio y orden inválidos dan su propio error, con la unidad del tipo', () => {
    const e = validatePackForm(form({ quantity: '0', price: '-1', sortOrder: '2000' }), 'create');
    expect(e.quantity).toContain('peticiones');
    expect(e.price).toContain('9,999,999');
    expect(e.sortOrder).toContain('1000');
    expect(validatePackForm(form({ kind: 'STORAGE', quantity: 'x' }), 'create').quantity).toContain('GB');
  });
});

describe('buildCreateBody — solo los campos del DTO', () => {
  it('arma el cuerpo con el código en mayúsculas y números reales, sin «recurring»', () => {
    const body = buildCreateBody(form({ code: ' ai_2000 ', name: '  +2,000 peticiones  ', quantity: '2,000', price: '$9.50', sortOrder: '15' }));
    expect(body).toEqual({ code: 'AI_2000', kind: 'AI', name: '+2,000 peticiones', quantity: 2000, priceUsd: 9.5, active: true, sortOrder: 15 });
    expect(Object.keys(body!).sort()).toEqual(['active', 'code', 'kind', 'name', 'priceUsd', 'quantity', 'sortOrder']);
    expect(typeof body!.quantity).toBe('number');
    expect(typeof body!.active).toBe('boolean');
  });
  it('un paquete inactivo se crea inactivo', () => {
    expect(buildCreateBody(form({ active: false }))?.active).toBe(false);
  });
  it('si algo no es válido o el código ya existe, no se envía nada', () => {
    expect(buildCreateBody(form({ quantity: '' }))).toBeNull();
    expect(buildCreateBody(form({ code: 'ai_1000' }), ['AI_1000'])).toBeNull();
  });
});

describe('buildUpdateBody — solo lo que cambió', () => {
  const orig = pack();
  const same = () => packToForm(orig);
  it('sin cambios no hay cuerpo (el botón queda apagado)', () => {
    expect(buildUpdateBody(same(), orig)).toBeNull();
  });
  it('envía solo los campos modificados y nunca el código ni el tipo', () => {
    expect(buildUpdateBody({ ...same(), price: '6' }, orig)).toEqual({ priceUsd: 6 });
    expect(buildUpdateBody({ ...same(), name: ' Otro nombre ', active: false, sortOrder: '99' }, orig)).toEqual({ name: 'Otro nombre', active: false, sortOrder: 99 });
    const all = buildUpdateBody({ ...same(), code: 'OTRO', kind: 'STORAGE', quantity: '2000', price: '7.25' }, orig)!;
    expect(all).toEqual({ quantity: 2000, priceUsd: 7.25 });
    expect(Object.keys(all)).not.toContain('code');
    expect(Object.keys(all)).not.toContain('kind');
  });
  it('espacios de más en el nombre no son un cambio', () => {
    expect(buildUpdateBody({ ...same(), name: `  ${orig.name}  ` }, orig)).toBeNull();
    expect(buildUpdateBody({ ...same(), name: `  ${orig.name} y más  ` }, orig)).toEqual({ name: `${orig.name} y más` });
  });
  it('el precio se compara como número: «5», «5.0» y «5.00» no son un cambio', () => {
    expect(buildUpdateBody({ ...same(), price: '5.0' }, orig)).toBeNull();
    expect(buildUpdateBody({ ...same(), price: '5.00' }, orig)).toBeNull();
  });
  it('con la cantidad bloqueada (pagos pendientes) la cantidad nunca se envía, aunque se haya tocado', () => {
    expect(buildUpdateBody({ ...same(), quantity: '9999' }, orig, { quantityLocked: true })).toBeNull();
    expect(buildUpdateBody({ ...same(), quantity: '9999', price: '6' }, orig, { quantityLocked: true })).toEqual({ priceUsd: 6 });
    expect(buildUpdateBody({ ...same(), quantity: '9999' }, orig, { quantityLocked: false })).toEqual({ quantity: 9999 });
  });
  it('un formulario inválido no se envía', () => {
    expect(buildUpdateBody({ ...same(), name: '' }, orig)).toBeNull();
    expect(buildUpdateBody({ ...same(), price: '-3' }, orig)).toBeNull();
  });
  it('reactivar y desactivar se detectan', () => {
    expect(buildUpdateBody({ ...same(), active: false }, orig)).toEqual({ active: false });
    expect(buildUpdateBody({ ...packToForm(pack({ active: false })), active: true }, pack({ active: false }))).toEqual({ active: true });
  });
});

describe('pendingByPack', () => {
  it('cuenta solo los pagos PENDIENTES de paquetes, por código', () => {
    const rows = [
      { kind: 'PACK', packCode: 'AI_1000', status: 'PENDING' }, { kind: 'PACK', packCode: 'AI_1000', status: 'PENDING' },
      { kind: 'PACK', packCode: 'AI_1000', status: 'APPROVED' }, { kind: 'PACK', packCode: 'STORAGE_10', status: 'PENDING' },
      { kind: 'LICENSE', packCode: null, status: 'PENDING' }, { kind: 'PACK', packCode: null, status: 'PENDING' },
    ] as never;
    expect(pendingByPack(rows)).toEqual({ AI_1000: 2, STORAGE_10: 1 });
  });
  it('sin datos no hay pendientes', () => {
    expect(pendingByPack(null)).toEqual({});
    expect(pendingByPack(undefined)).toEqual({});
    expect(pendingByPack([])).toEqual({});
  });
  it('el texto del bloqueo concuerda en singular y plural y dice qué hacer', () => {
    expect(quantityLockText(1)).toContain('1 pago pendiente:');
    expect(quantityLockText(3)).toContain('3 pagos pendientes:');
    expect(quantityLockText(2)).toContain('crea un paquete nuevo y desactiva este');
  });
});

describe('packEconomics — costo y margen', () => {
  it('IA: costo = peticiones × costo por petición; margen sobre el precio de la venta', () => {
    const e = packEconomics('AI', 1000, 5, 0.0012);
    expect(e.cost).toBeCloseTo(1.2, 6);
    expect(e.margin).toEqual({ amount: expect.closeTo(3.8, 6), pct: 76 });
  });
  it('espacio: costo mensual = GB × tarifa; margen sobre el precio por mes', () => {
    const e = packEconomics('STORAGE', 100, 12, 0.0012);
    expect(e.cost).toBeCloseTo(2.13, 6);
    expect(e.margin?.pct).toBe(82);
  });
  it('precio por debajo del costo: margen negativo', () => {
    expect(packEconomics('AI', 10000, 5, 0.0012).margin).toEqual({ amount: expect.closeTo(-7, 6), pct: -140 });
  });
  it('sin cantidad o sin precio no hay margen, y sin precio sí hay costo', () => {
    expect(packEconomics('AI', null, 5, 0.0012)).toEqual({ cost: null, margin: null });
    expect(packEconomics('AI', 1000, null, 0.0012).margin).toBeNull();
    expect(packEconomics('AI', 1000, null, 0.0012).cost).toBeCloseTo(1.2, 6);
    expect(packEconomics('AI', 1000, 0, 0.0012).margin).toBeNull(); // precio 0: no hay margen que calcular
  });
  it('un costo por petición inválido no rompe', () => {
    expect(packEconomics('AI', 1000, 5, Number.NaN)).toEqual({ cost: null, margin: null });
  });
});

describe('packWarnings', () => {
  const base = (over: Partial<Parameters<typeof packWarnings>[0]> = {}) => {
    const f = over.form ?? form();
    const quantity = over.quantity === undefined ? 2000 : over.quantity;
    const price = over.price === undefined ? 9 : over.price;
    return packWarnings({ form: f, quantity, price, economics: packEconomics(f.kind, quantity, price, 0.0012), others: [pack()], ...over });
  };
  it('un paquete sano no tiene advertencias', () => {
    expect(base()).toEqual([]);
  });
  it('precio $0', () => {
    expect(base({ price: 0 }).join(' ')).toContain('gratis');
  });
  it('por debajo del costo (pérdida)', () => {
    const w = base({ quantity: 10000, price: 5, form: form({ quantity: '10000', price: '5' }) });
    expect(w.join(' ')).toContain('por debajo del costo estimado');
    expect(w.join(' ')).toContain('$12.00');
  });
  it(`margen bajo (menos de ${LOW_MARGIN_PCT} %) pero positivo`, () => {
    const w = base({ quantity: 2000, price: 3, form: form({ price: '3' }) }); // costo $2.40 → margen 20 %
    expect(w.join(' ')).toContain('Margen bajo (20 %)');
    expect(w.join(' ')).not.toContain('por debajo del costo');
  });
  it('el umbral de margen es exacto: justo 40 % no avisa; por debajo sí', () => {
    // 1,000 peticiones cuestan $1.20: a $2.00 el margen es exactamente 40 %
    expect(base({ quantity: 1000, price: 2, form: form({ quantity: '1000', price: '2' }), others: [] }).join(' ')).not.toContain('Margen bajo');
    expect(base({ quantity: 1000, price: 1.8, form: form({ quantity: '1000', price: '1.8' }), others: [] }).join(' ')).toContain('Margen bajo (33 %)');
  });
  it('una pérdida pequeña (menos de $1) también avisa de que se vende por debajo del costo', () => {
    const w = base({ quantity: 1000, price: 1, form: form({ quantity: '1000', price: '1' }), others: [] }).join(' '); // costo $1.20, precio $1.00
    expect(w).toContain('por debajo del costo estimado ($1.20)');
    expect(w).not.toContain('Margen bajo');
  });
  it('misma cantidad que otro paquete activo del mismo tipo (no del otro tipo ni de uno inactivo)', () => {
    expect(base({ quantity: 1000, form: form({ quantity: '1000' }) }).join(' ')).toContain('«+1,000 peticiones de IA»');
    expect(base({ quantity: 1000, form: form({ quantity: '1000', kind: 'STORAGE' }), others: [pack()] }).join(' ')).not.toContain('misma cantidad');
    expect(base({ quantity: 1000, form: form({ quantity: '1000' }), others: [pack({ active: false })] }).join(' ')).not.toContain('misma cantidad');
    expect(base({ quantity: 1000, form: form({ quantity: '1000', active: false }) }).join(' ')).not.toContain('misma cantidad');
  });
  it('desactivar el único paquete activo de un tipo avisa que los clientes no podrán comprar', () => {
    const inactive = form({ active: false });
    expect(base({ form: inactive, others: [] }).join(' ')).toContain('no podrán comprar más peticiones');
    expect(base({ form: form({ kind: 'STORAGE', active: false }), others: [pack()] }).join(' ')).toContain('no podrán comprar más espacio');
    expect(base({ form: inactive, others: [pack()] }).join(' ')).not.toContain('no podrán comprar');
  });
});

describe('activeCoverage y sortPacks', () => {
  it('cuenta los activos de cada tipo', () => {
    const rows = [pack(), pack({ code: 'AI_5000', active: false }), pack({ code: 'STORAGE_10', kind: 'STORAGE' }), pack({ code: 'STORAGE_50', kind: 'STORAGE', active: false })];
    expect(activeCoverage(rows)).toEqual({ AI: 1, STORAGE: 1 });
    expect(activeCoverage([])).toEqual({ AI: 0, STORAGE: 0 });
    expect(activeCoverage(null)).toEqual({ AI: 0, STORAGE: 0 });
  });
  it('ordena por «orden» y, a igual orden, por código, sin modificar la lista recibida', () => {
    const rows = [pack({ code: 'B', sortOrder: 20 }), pack({ code: 'A', sortOrder: 20 }), pack({ code: 'C', sortOrder: 5 })];
    expect(sortPacks(rows).map((r) => r.code)).toEqual(['C', 'A', 'B']);
    expect(rows.map((r) => r.code)).toEqual(['B', 'A', 'C']);
  });
});

describe('packPreview — cómo lo ve el cliente', () => {
  it('IA: título, precio y «pago único»', () => {
    expect(packPreview({ kind: 'AI', name: '+5,000 peticiones de IA', quantity: '5000', price: '20' })).toEqual({
      title: '+5,000 peticiones', name: '+5,000 peticiones de IA', priceText: '$20.00', cadence: 'pago único', unitText: '$4.00 por cada 1,000',
    });
  });
  it('espacio: «al mes» y el precio por GB', () => {
    expect(packPreview({ kind: 'STORAGE', name: '+1 TB', quantity: '1000', price: '150' })).toMatchObject({ title: '+1 TB', cadence: 'al mes', unitText: '$150.00 al mes · $0.15 por GB' });
    // por debajo de $0.10 por GB el cliente ve tres decimales: la vista previa dice lo mismo que verá él
    expect(packPreview({ kind: 'STORAGE', name: 'x', quantity: '100', price: '4' })?.unitText).toBe('$4.00 al mes · $0.040 por GB');
  });
  it('sin nombre usa el sugerido; con datos inválidos no hay vista previa', () => {
    expect(packPreview({ kind: 'STORAGE', name: ' ', quantity: '50', price: '12' })?.name).toBe('+50 GB de espacio');
    expect(packPreview({ kind: 'AI', name: 'x', quantity: '', price: '5' })).toBeNull();
    expect(packPreview({ kind: 'AI', name: 'x', quantity: '10', price: 'gratis' })).toBeNull();
  });
});

describe('normalizeCode', () => {
  it('recorta y pasa a mayúsculas', () => {
    expect(normalizeCode('  ai_2000 ')).toBe('AI_2000');
    expect(normalizeCode(undefined as never)).toBe('');
  });
});

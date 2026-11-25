import {
  AUDIENCES, CORE_TEXT, assistantLines, audiencesIn, bestSavings, billingText, contactHref, contactMessage, defaultAudience, defaultDuration, durationLabel, durationsIn,
  ensureDuration, fileTypesNote, functionLabels, gbText, headlinePrice, limitRows, mbText, moduleRows, packGroups, packLine, parsePublicCatalog, plansIn, priceFor, priceView,
  savingsPercent, trialText, validEmail, validWhatsapp, type PublicPack, type PublicPlan,
} from './public-catalog';

const plan = (over: Partial<PublicPlan> = {}): PublicPlan => ({
  code: 'EMPRESA_DESPACHO', name: 'Empresa Despacho', audience: 'EMPRESA', description: 'Despacho de auditoría pequeño o mediano.', featured: false, trialDays: 14,
  limits: { users: 5, maxUsers: 15, extraUserPriceUsd: 19, storageGb: 100, maxFileMb: 500, aiRequests: 5000, fileTypes: ['VIDEO', 'AUDIO', 'PDF', 'FOTO', 'PPT', 'XLS', 'OTROS'], packsAi: true, packsStorage: true },
  modules: ['CARTERA', 'HORAS'], functions: ['FIRMA', 'MARCA'], assistants: ['MINERVA', 'FISCUS', 'THEMIS'],
  prices: [{ months: 1, priceUsd: 149 }, { months: 3, priceUsd: 425 }, { months: 6, priceUsd: 805 }, { months: 12, priceUsd: 1490 }], ...over,
});
const persona = plan({ code: 'PERSONA_INICIAL', name: 'Persona Inicial', audience: 'PERSONA', prices: [{ months: 1, priceUsd: 29 }, { months: 12, priceUsd: 290 }] });

describe('parsePublicCatalog — lectura defensiva', () => {
  const good = { currency: 'USD', plans: [plan()], packs: [{ kind: 'AI', name: '+1,000 peticiones de IA', quantity: 1000, priceUsd: 5 }], contact: { email: 'ventas@auditmind.com', whatsapp: '50370000000' } };

  it('un catálogo válido pasa tal cual', () => {
    const c = parsePublicCatalog(good)!;
    expect(c.currency).toBe('USD');
    expect(c.plans[0]).toMatchObject({ code: 'EMPRESA_DESPACHO', audience: 'EMPRESA', trialDays: 14, modules: ['CARTERA', 'HORAS'] });
    expect(c.plans[0].prices.map((p) => p.months)).toEqual([1, 3, 6, 12]);
    expect(c.packs).toHaveLength(1);
    expect(c.contact).toEqual({ email: 'ventas@auditmind.com', whatsapp: '50370000000' });
  });
  it('lo que no es un catálogo da null (la página muestra «no disponible», no revienta)', () => {
    for (const bad of [null, undefined, 'x', 42, [], {}, { plans: 'no' }, { plans: {} }]) expect(parsePublicCatalog(bad)).toBeNull();
  });
  it('descarta planes sin código, nombre o audiencia válida, y entradas que no son objetos', () => {
    const c = parsePublicCatalog({ plans: [plan(), { ...plan(), code: '' }, { ...plan(), name: '  ' }, { ...plan(), audience: 'GOBIERNO' }, null, 'x', 7] })!;
    expect(c.plans).toHaveLength(1);
  });
  it('descarta claves desconocidas de módulos, funciones, asistentes y tipos de archivo', () => {
    const c = parsePublicCatalog({ plans: [{ ...plan(), modules: ['CARTERA', 'INVENTADO', 5], functions: ['<script>'], assistants: ['MINERVA', 'NADIE'], limits: { ...plan().limits, fileTypes: ['PDF', 'EXE'] } }] })!;
    expect(c.plans[0].modules).toEqual(['CARTERA']);
    expect(c.plans[0].functions).toEqual([]);
    expect(c.plans[0].assistants).toEqual(['MINERVA']);
    expect(c.plans[0].limits.fileTypes).toEqual(['PDF']);
  });
  it('precios: solo duraciones conocidas, números válidos, sin repetir, de menor a mayor', () => {
    const c = parsePublicCatalog({ plans: [{ ...plan(), prices: [
      { months: 12, priceUsd: 100 }, { months: 1, priceUsd: 10 }, { months: 5, priceUsd: 1 }, { months: 3, priceUsd: -1 }, { months: 6, priceUsd: 'x' }, { months: 12, priceUsd: 999 }, null,
    ] }] })!;
    expect(c.plans[0].prices).toEqual([{ months: 1, priceUsd: 10 }, { months: 12, priceUsd: 100 }]);
  });
  it('paquetes inválidos se descartan', () => {
    const c = parsePublicCatalog({ plans: [], packs: [good.packs[0], { kind: 'VIDEO', name: 'x', quantity: 1, priceUsd: 1 }, { kind: 'AI', name: 'x', quantity: 0, priceUsd: 1 }, { kind: 'AI', name: 'x', quantity: 5, priceUsd: -1 }, 'x'] })!;
    expect(c.packs).toHaveLength(1);
  });
  it('un contacto raro se descarta (la página lo usa para armar enlaces)', () => {
    expect(parsePublicCatalog({ plans: [], contact: { email: 'javascript:alert(1)', whatsapp: '+503 7000' } })!.contact).toEqual({ email: null, whatsapp: null });
    expect(parsePublicCatalog({ plans: [], contact: null })!.contact).toEqual({ email: null, whatsapp: null });
    expect(parsePublicCatalog({ plans: [] })!.contact).toEqual({ email: null, whatsapp: null });
  });
  it('«más elegido» solo si el API lo dice de verdad (ausente o con otro valor no cuenta)', () => {
    const base = { code: 'X', name: 'X', audience: 'PERSONA' };
    const featured = (extra: Record<string, unknown>) => parsePublicCatalog({ plans: [{ ...base, ...extra }] })!.plans[0].featured;
    expect(featured({ featured: true })).toBe(true);
    expect(featured({})).toBe(false);
    expect(featured({ featured: false })).toBe(false);
    expect(featured({ featured: 'true' })).toBe(false);
    expect(featured({ featured: 1 })).toBe(false);
  });
  it('un precio de usuario adicional negativo se toma como 0', () => {
    const c = parsePublicCatalog({ plans: [{ code: 'X', name: 'X', audience: 'PERSONA', limits: { extraUserPriceUsd: -5, users: 1, maxUsers: 3 } }] })!;
    expect(c.plans[0].limits.extraUserPriceUsd).toBe(0);
    expect(limitRows(c.plans[0]).map((r) => r.label)).not.toContain('Usuario adicional');
  });
  it('límites faltantes toman valores neutros y los días de prueba nunca son negativos', () => {
    const c = parsePublicCatalog({ plans: [{ code: 'X', name: 'X', audience: 'PERSONA', trialDays: -4, limits: 'raro' }] })!;
    expect(c.plans[0].trialDays).toBe(0);
    expect(c.plans[0].limits).toMatchObject({ users: 1, storageGb: 0, aiRequests: 0, fileTypes: [], packsAi: true });
  });
});

describe('validEmail / validWhatsapp', () => {
  it('correo', () => {
    expect(validEmail(' ventas@auditmind.com ')).toBe('ventas@auditmind.com');
    for (const bad of ['', 'a@b', 'a b@c.com', 'javascript:alert(1)', 'x@y.z\nBcc: a@b.co', 5, null]) expect(validEmail(bad)).toBeNull();
    expect(validEmail(`${'a'.repeat(249)}@x.com`)).toBeNull(); // 255 caracteres: uno más del máximo
    expect(validEmail(`${'a'.repeat(248)}@x.com`)).not.toBeNull(); // 254: justo el máximo
  });
  it('WhatsApp: solo dígitos de 8 a 15', () => {
    expect(validWhatsapp('50370000000')).toBe('50370000000');
    for (const bad of ['', '1234567', '1234567890123456', '+50370000000', '503 7000', 'x', 70000000, null]) expect(validWhatsapp(bad)).toBeNull();
  });
});

describe('audiencia y duración', () => {
  const all = [persona, plan(), plan({ code: 'PLUS', name: 'Plus', featured: true })];
  it('audiencias presentes, en orden fijo (Personas, Empresas)', () => {
    expect(AUDIENCES.map((a) => a.id)).toEqual(['PERSONA', 'EMPRESA']);
    expect(audiencesIn(all)).toEqual(['PERSONA', 'EMPRESA']);
    expect(audiencesIn([plan()])).toEqual(['EMPRESA']);
    expect(audiencesIn([])).toEqual([]);
  });
  it('por defecto Empresas si hay; si no, la que exista', () => {
    expect(defaultAudience(all)).toBe('EMPRESA');
    expect(defaultAudience([persona])).toBe('PERSONA');
    expect(defaultAudience([])).toBeNull();
  });
  it('plansIn conserva el orden y filtra por audiencia', () => {
    expect(plansIn(all, 'EMPRESA').map((p) => p.code)).toEqual(['EMPRESA_DESPACHO', 'PLUS']);
    expect(plansIn(all, 'PERSONA').map((p) => p.code)).toEqual(['PERSONA_INICIAL']);
  });
  it('duraciones: las que algún plan tiene con precio, de menor a mayor', () => {
    expect(durationsIn(all)).toEqual([1, 3, 6, 12]);
    expect(durationsIn([persona])).toEqual([1, 12]);
    expect(durationsIn([plan({ prices: [] })])).toEqual([]);
  });
  it('por defecto el anual; sin anual, la más larga; sin nada, null', () => {
    expect(defaultDuration([1, 3, 6, 12])).toBe(12);
    expect(defaultDuration([1, 3])).toBe(3);
    expect(defaultDuration([1])).toBe(1);
    expect(defaultDuration([])).toBeNull();
  });
  it('al cambiar de audiencia, una duración que ya no existe se reemplaza', () => {
    expect(ensureDuration(6, [1, 12])).toBe(12);
    expect(ensureDuration(1, [1, 12])).toBe(1);
    expect(ensureDuration(3, [])).toBeNull();
  });
  it('etiquetas de duración', () => {
    expect(durationLabel(1)).toBe('Mensual');
    expect(durationLabel(12)).toBe('Anual');
    expect(durationLabel(7)).toBe('7 meses');
  });
});

describe('precios y ahorros', () => {
  it('priceFor devuelve el precio de esa duración o null', () => {
    expect(priceFor(plan(), 12)).toBe(1490);
    expect(priceFor(plan(), 5)).toBeNull();
    expect(priceFor(plan({ prices: [] }), 1)).toBeNull();
  });
  it('ahorro frente a pagar mes a mes, entero', () => {
    expect(savingsPercent(plan(), 3)).toBe(5); // 425 / 3 = 141.67 vs 149
    expect(savingsPercent(plan(), 6)).toBe(10);
    expect(savingsPercent(plan(), 12)).toBe(17); // 1490 / 12 = 124.17
  });
  it('sin ahorro, sin precio mensual o en la duración mensual no hay ahorro que mostrar', () => {
    expect(savingsPercent(plan(), 1)).toBeNull();
    expect(savingsPercent(plan({ prices: [{ months: 12, priceUsd: 1000 }] }), 12)).toBeNull();
    expect(savingsPercent(plan({ prices: [{ months: 1, priceUsd: 100 }, { months: 12, priceUsd: 1300 }] }), 12)).toBeNull(); // más caro que mensual
    expect(savingsPercent(plan({ prices: [{ months: 1, priceUsd: 100 }, { months: 12, priceUsd: 1200 }] }), 12)).toBeNull(); // igual que pagar mes a mes: no es un ahorro
    expect(savingsPercent(plan({ prices: [{ months: 1, priceUsd: 100 }, { months: 12, priceUsd: 1199 }] }), 12)).toBeNull(); // 0.08 % redondea a 0: tampoco
    expect(savingsPercent(plan({ prices: [{ months: 1, priceUsd: 0 }, { months: 12, priceUsd: 0 }] }), 12)).toBeNull();
    expect(savingsPercent(plan(), 5)).toBeNull();
  });
  it('el mayor ahorro entre los planes', () => {
    const generous = plan({ prices: [{ months: 1, priceUsd: 100 }, { months: 12, priceUsd: 800 }] }); // 33 %
    expect(bestSavings([plan(), generous], 12)).toBe(33);
    expect(bestSavings([plan()], 12)).toBe(17);
    expect(bestSavings([], 12)).toBeNull();
    expect(bestSavings([plan()], 1)).toBeNull();
  });
  it('vista de precio: por mes, total y ahorro; sin precio, «no disponible»', () => {
    expect(priceView(plan(), 12)).toEqual({ priced: true, months: 12, perMonth: 1490 / 12, total: 1490, savings: 17 });
    expect(priceView(plan(), 1)).toEqual({ priced: true, months: 1, perMonth: 149, total: 149, savings: null });
    expect(priceView(plan(), 5)).toEqual({ priced: false });
    expect(priceView(plan({ prices: [] }), 12)).toEqual({ priced: false });
    expect(priceView(plan(), 0)).toEqual({ priced: false });
    // aunque llegara un precio con duración 0 (no debería), nunca se divide entre cero
    expect(priceView({ prices: [{ months: 0, priceUsd: 10 }] }, 0)).toEqual({ priced: false });
  });
  it('el titular del precio no lleva centavos cuando no los hay', () => {
    expect(headlinePrice(149)).toBe('$149');
    expect(headlinePrice(1490)).toBe('$1,490');
    expect(headlinePrice(1490 / 12)).toBe('$124.17');
    expect(headlinePrice(24.1666)).toBe('$24.17');
    expect(headlinePrice(0)).toBe('$0');
  });
  it('texto de facturación', () => {
    expect(billingText(priceView(plan(), 1) as never)).toBe('Se paga cada mes');
    expect(billingText(priceView(plan(), 12) as never)).toBe('Se paga $1,490.00 por 12 meses');
  });
});

describe('filas de la tarjeta', () => {
  it('espacio y archivo máximo en la unidad que se lee mejor', () => {
    expect(gbText(100)).toBe('100 GB');
    expect(gbText(500)).toBe('500 GB');
    expect(gbText(1000)).toBe('1 TB');
    expect(gbText(2000)).toBe('2 TB');
    expect(gbText(1500)).toBe('1,500 GB');
    expect(gbText(-1)).toBe('Sin tope');
    expect(mbText(500)).toBe('500 MB');
    expect(mbText(2048)).toBe('2 GB');
    expect(mbText(1500)).toBe('1,500 MB');
    expect(mbText(-1)).toBe('Sin tope');
  });
  it('límites de un plan de equipo: usuarios incluidos y máximo, usuario adicional, espacio, IA y asistentes', () => {
    expect(limitRows(plan())).toEqual([
      { label: 'Usuarios', value: '5 incluidos (hasta 15)' }, { label: 'Usuario adicional', value: '$19.00 al mes' }, { label: 'Espacio', value: '100 GB' },
      { label: 'Archivo máximo', value: '500 MB' }, { label: 'Peticiones de IA al mes', value: '5,000' }, { label: 'Asistentes de IA', value: '3' },
    ]);
  });
  it('un plan de una persona no muestra «usuario adicional» ni «hasta»', () => {
    const rows = limitRows(plan({ limits: { ...plan().limits, users: 1, maxUsers: 1, extraUserPriceUsd: 0 } }));
    expect(rows[0]).toEqual({ label: 'Usuarios', value: '1' });
    expect(rows.map((r) => r.label)).not.toContain('Usuario adicional');
  });
  it('sin precio de usuario adicional o sin margen para agregar usuarios no se ofrece', () => {
    expect(limitRows(plan({ limits: { ...plan().limits, extraUserPriceUsd: 0 } })).map((r) => r.label)).not.toContain('Usuario adicional');
    expect(limitRows(plan({ limits: { ...plan().limits, users: 5, maxUsers: 5, extraUserPriceUsd: 19 } })).map((r) => r.label)).not.toContain('Usuario adicional');
  });
  it('sin tope se dice «Sin tope»', () => {
    const rows = limitRows(plan({ limits: { ...plan().limits, users: -1, storageGb: -1, aiRequests: -1, maxFileMb: -1 } }));
    expect(rows.find((r) => r.label === 'Usuarios')!.value).toBe('Sin tope');
    expect(rows.find((r) => r.label === 'Espacio')!.value).toBe('Sin tope');
    expect(rows.find((r) => r.label === 'Peticiones de IA al mes')!.value).toBe('Sin tope');
    expect(rows.find((r) => r.label === 'Archivo máximo')!.value).toBe('Sin tope');
  });
  it('usuarios ampliables sin máximo', () => {
    expect(limitRows(plan({ limits: { ...plan().limits, users: 10, maxUsers: -1 } }))[0].value).toBe('10 incluidos, ampliable');
  });
  it('tipos de archivo que no admite (el video es lo que más pesa)', () => {
    expect(fileTypesNote(plan())).toBeNull();
    expect(fileTypesNote(plan({ limits: { ...plan().limits, fileTypes: ['AUDIO', 'PDF', 'FOTO', 'PPT', 'XLS', 'OTROS'] } }))).toBe('No admite: Video');
    expect(fileTypesNote(plan({ limits: { ...plan().limits, fileTypes: ['PDF'] } }))).toBe('No admite: Video, Audio, Fotos, Presentaciones, Excel y CSV, Otros');
    expect(fileTypesNote(plan({ limits: { ...plan().limits, fileTypes: [] } }))).toBeNull(); // vacío = sin restricción en el API
  });
  it('todos los módulos aparecen, marcando los incluidos', () => {
    const rows = moduleRows(plan());
    expect(rows).toHaveLength(7);
    expect(rows.filter((r) => r.included).map((r) => r.key)).toEqual(['CARTERA', 'HORAS']);
    expect(rows.find((r) => r.key === 'CARTERA')!.label).toBe('Cartera de Auditoría Externa');
    expect(CORE_TEXT).toContain('papeles de trabajo');
  });
  it('funciones, asistentes y prueba', () => {
    expect(functionLabels(plan())).toEqual(['Firma electrónica por enlace', 'Marca propia']);
    expect(assistantLines(plan())).toEqual(['MINERVA · Planificación y Riesgos', 'FISCUS · Auditoría Fiscal (NACOT)', 'THEMIS · Prevención de lavado (PLD/FT)']);
    expect(trialText(plan())).toBe('Prueba de 14 días');
    expect(trialText(plan({ trialDays: 1 }))).toBe('Prueba de 1 día');
    expect(trialText(plan({ trialDays: 0 }))).toBeNull();
  });
});

describe('paquetes', () => {
  const packs: PublicPack[] = [
    { kind: 'STORAGE', name: '+200 GB', quantity: 200, priceUsd: 40 }, { kind: 'AI', name: '+5,000', quantity: 5000, priceUsd: 20 },
    { kind: 'AI', name: '+1,000', quantity: 1000, priceUsd: 5 }, { kind: 'STORAGE', name: '+50 GB', quantity: 50, priceUsd: 12 },
  ];
  it('separados por tipo, del más chico al más grande, sin modificar la lista recibida', () => {
    const g = packGroups(packs);
    expect(g.ai.map((p) => p.quantity)).toEqual([1000, 5000]);
    expect(g.storage.map((p) => p.quantity)).toEqual([50, 200]);
    expect(packs[0].quantity).toBe(200);
  });
  it('línea de un paquete: igual que en «Comprar más»', () => {
    expect(packLine(packs[2])).toEqual({ title: '+1,000 peticiones', price: '$5.00', unit: '$5.00 por cada 1,000' });
    expect(packLine(packs[3])).toEqual({ title: '+50 GB', price: '$12.00 al mes', unit: '$12.00 al mes · $0.24 por GB' });
  });
});

describe('contacto — enlaces seguros', () => {
  const msg = contactMessage('TRIAL', plan(), 12);
  it('el mensaje de prueba nombra el plan, los días y la duración', () => {
    expect(msg.subject).toBe('Quiero la prueba de 14 días del plan Empresa Despacho');
    expect(msg.body).toContain('plan Empresa Despacho (anual)');
    expect(contactMessage('TRIAL', plan({ trialDays: 0 }), null).subject).toBe('Quiero la prueba del plan Empresa Despacho');
    expect(contactMessage('DEMO').subject).toBe('Quiero una demo de Nova Criterio');
    expect(contactMessage('CORPORATE').subject).toBe('Plan institucional de Nova Criterio');
    expect(contactMessage('TRIAL', null).subject).toBe('Quiero una demo de Nova Criterio'); // sin plan cae en la demo
  });
  it('con correo: mailto con asunto y cuerpo codificados', () => {
    const href = contactHref({ email: 'ventas@auditmind.com', whatsapp: '50370000000' }, msg)!;
    expect(href.startsWith('mailto:ventas@auditmind.com?subject=')).toBe(true);
    expect(href).toContain(encodeURIComponent('Quiero la prueba de 14 días del plan Empresa Despacho'));
    expect(href).not.toContain('\n');
    expect(href).not.toContain(' ');
  });
  it('sin correo: WhatsApp con el texto codificado', () => {
    const href = contactHref({ email: null, whatsapp: '50370000000' }, msg)!;
    expect(href.startsWith('https://wa.me/50370000000?text=')).toBe(true);
    expect(decodeURIComponent(href.split('text=')[1])).toContain('Quiero la prueba');
    expect(href).not.toContain(' ');
  });
  it('sin ningún contacto no hay enlace (la página no muestra botones)', () => {
    expect(contactHref({ email: null, whatsapp: null }, msg)).toBeNull();
    expect(contactHref(null, msg)).toBeNull();
    expect(contactHref(undefined, msg)).toBeNull();
  });
  it('un contacto inválido no genera enlace aunque llegue hasta aquí', () => {
    expect(contactHref({ email: 'javascript:alert(1)', whatsapp: 'x' } as never, msg)).toBeNull();
    expect(contactHref({ email: 'a b@c.com', whatsapp: '123' } as never, msg)).toBeNull();
  });
  it('un nombre de plan con símbolos de URL no rompe el enlace', () => {
    const href = contactHref({ email: 'ventas@auditmind.com', whatsapp: null }, contactMessage('TRIAL', plan({ name: 'A&B=C?#x' }), 1))!;
    expect(href.split('?').length).toBe(2); // un solo «?»: el nombre quedó codificado
    expect(href).not.toContain('&B=C');
  });
});

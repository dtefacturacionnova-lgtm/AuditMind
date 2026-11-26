import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../../auth/jwt.strategy';
import { PaperLibraryAdminService } from './paper-library-admin.service';
import { PAPER_LIBRARY } from './index';
import { effectiveEntry, loadMergedPaper, MAX_OWN_PER_PAPER, OrgLibraryDb } from './org-library';
import { fakeLibraryDb } from './org-library.testkit';

const MANAGER = { id: 'u1', role: 'AUDIT_MANAGER', organizationId: 'org1' } as AuthUser;
const OTRA_ORG = { id: 'u9', role: 'AUDIT_MANAGER', organizationId: 'org2' } as AuthUser;
const PAPEL = 'PT-NIA550';
const BASE = PAPER_LIBRARY[PAPEL].procedures;

const NUEVO = {
  title: 'Revisar acuerdos verbales con la administración',
  statement: 'Indagar con la gerencia si existen operaciones con partes vinculadas pactadas sin contrato escrito durante el período.',
  development: 'Se indagó con [completar: nombre y cargo] sobre acuerdos verbales. La respuesta fue [completar: respuesta]. Se contrastó con [completar: evidencia revisada].',
  technique: 'Indagación' as const,
  priority: 'MEDIUM' as const,
};

function armar(seed: Parameters<typeof fakeLibraryDb>[0] = []) {
  const db = fakeLibraryDb(seed);
  const svc = new PaperLibraryAdminService(db as any);
  return { svc, db };
}
const items = async (svc: PaperLibraryAdminService, user = MANAGER, code = PAPEL) => (await svc.getPaper(user, code)).items;

describe('PaperLibraryAdminService — lectura', () => {
  it('sin ajustes de la organización, el papel muestra el catálogo del sistema tal cual', async () => {
    const { svc } = armar();
    const p = await svc.getPaper(MANAGER, PAPEL);
    expect(p.hasBase).toBe(true);
    expect(p.items.map((i) => i.id)).toEqual(BASE.map((b) => b.id));
    expect(p.items.every((i) => i.origin === 'BASE' && !i.hidden && !i.rowId)).toBe(true);
    expect(p.title).toBeTruthy();
  });

  it('un papel que no existe en el catálogo ni tiene ajustes sale vacío, no con error', async () => {
    const { svc } = armar();
    const p = await svc.getPaper(MANAGER, 'PT-NO-EXISTE');
    expect(p.hasBase).toBe(false);
    expect(p.items).toEqual([]);
  });

  it('rechaza un código de papel con caracteres raros', async () => {
    const { svc } = armar();
    await expect(svc.getPaper(MANAGER, '../etc/passwd')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.createOwn(MANAGER, 'a b', NUEVO)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('listPapers cuenta lo que ajustó la organización y suma los papeles que solo existen por ella', async () => {
    const { svc } = armar();
    await svc.overrideBase(MANAGER, PAPEL, BASE[0].id, { hidden: true });
    await svc.overrideBase(MANAGER, PAPEL, BASE[1].id, { content: { ...baseAsInput(1), priority: 'LOW' } });
    await svc.createOwn(MANAGER, PAPEL, NUEVO);
    await svc.createOwn(MANAGER, 'PT-FISC-CAAT-PROPIO', NUEVO);
    const lista = await svc.listPapers(MANAGER);
    const nia = lista.find((p) => p.paperCode === PAPEL)!;
    expect(nia).toMatchObject({ baseCount: BASE.length, hiddenCount: 1, editedCount: 1, ownCount: 1 });
    expect(lista.find((p) => p.paperCode === 'PT-FISC-CAAT-PROPIO')).toMatchObject({ baseCount: 0, ownCount: 1 });
    expect(lista.map((p) => p.paperCode)).toEqual([...lista.map((p) => p.paperCode)].sort());
    // Otra organización no ve esos conteos.
    const otra = (await svc.listPapers(OTRA_ORG)).find((p) => p.paperCode === PAPEL)!;
    expect(otra).toMatchObject({ hiddenCount: 0, editedCount: 0, ownCount: 0 });
    expect((await svc.listPapers(OTRA_ORG)).find((p) => p.paperCode === 'PT-FISC-CAAT-PROPIO')).toBeUndefined();
  });
});

function baseAsInput(i: number) {
  const b = BASE[i];
  return { title: b.title, statement: b.statement, development: b.development, technique: b.technique, ref: b.ref, priority: b.priority, auditTypes: b.auditTypes };
}

describe('PaperLibraryAdminService — procedimientos propios', () => {
  it('crea uno propio: queda al final, rotulado OWN, y se guarda con la organización y el autor', async () => {
    const { svc, db } = armar();
    const r = await svc.createOwn(MANAGER, PAPEL, NUEVO);
    const lista = await items(svc);
    expect(lista).toHaveLength(BASE.length + 1);
    const propio = lista[lista.length - 1];
    expect(propio).toMatchObject({ id: r.id, origin: 'OWN', title: NUEVO.title, technique: 'Indagación', priority: 'MEDIUM', hidden: false, rowId: r.rowId });
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({ organizationId: 'org1', kind: 'PAPER_PROCEDURE', groupKey: PAPEL, isSystem: false, createdById: 'u1', itemLabel: NUEVO.title, itemSubtitle: 'Indagación' });
  });

  it('recorta espacios y guarda auditTypes sin repetidos ni vacíos; ref vacía se descarta', async () => {
    const { svc } = armar();
    await svc.createOwn(MANAGER, PAPEL, { ...NUEVO, title: `  ${NUEVO.title}  `, ref: '   ', auditTypes: ['FISCAL', 'FISCAL', ' ', 'AML'] });
    const propio = (await items(svc)).at(-1)!;
    expect(propio.title).toBe(NUEVO.title);
    expect(propio.ref).toBeUndefined();
    expect(propio.auditTypes).toEqual(['FISCAL', 'AML']);
  });

  it.each([
    ['título corto', { title: 'Corto' }],
    ['título largo', { title: 'x'.repeat(91) }],
    ['enunciado corto', { statement: 'Muy corto.' }],
    ['enunciado largo', { statement: 'x'.repeat(601) }],
    ['desarrollo corto', { development: 'Poco.' }],
    ['desarrollo largo', { development: 'x'.repeat(1501) }],
    ['técnica inventada', { technique: 'Adivinación' as any }],
    ['sin técnica', { technique: undefined }],
    ['prioridad inventada', { priority: 'URGENT' as any }],
    ['referencia larguísima', { ref: 'x'.repeat(61) }],
    ['tipo de encargo inventado', { auditTypes: ['NO_EXISTE'] }],
  ])('rechaza datos inválidos: %s', async (_n, over) => {
    const { svc, db } = armar();
    await expect(svc.createOwn(MANAGER, PAPEL, { ...NUEVO, ...over })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.rows).toHaveLength(0);
  });

  it('acepta referencias libres (la organización conoce su norma local) y marcadores opcionales', async () => {
    const { svc } = armar();
    await expect(svc.createOwn(MANAGER, PAPEL, { ...NUEVO, ref: 'Art. 62 Código Tributario', development: 'x'.repeat(100) })).resolves.toBeTruthy();
  });

  it('no deja crear un duplicado del sistema ni de otro propio (por título o por enunciado)', async () => {
    const { svc } = armar();
    await expect(svc.createOwn(MANAGER, PAPEL, { ...NUEVO, title: BASE[0].title })).rejects.toBeInstanceOf(ConflictException);
    await expect(svc.createOwn(MANAGER, PAPEL, { ...NUEVO, statement: BASE[0].statement })).rejects.toBeInstanceOf(ConflictException);
    await svc.createOwn(MANAGER, PAPEL, NUEVO);
    await expect(svc.createOwn(MANAGER, PAPEL, { ...NUEVO, title: NUEVO.title.toUpperCase() })).rejects.toBeInstanceOf(ConflictException);
  });

  it('sí deja crear uno con el título de un procedimiento OCULTO (ya no se sugiere)', async () => {
    const { svc } = armar();
    await svc.overrideBase(MANAGER, PAPEL, BASE[0].id, { hidden: true });
    await expect(svc.createOwn(MANAGER, PAPEL, { ...NUEVO, title: BASE[0].title })).resolves.toBeTruthy();
  });

  it(`tiene un tope de ${MAX_OWN_PER_PAPER} procedimientos propios por papel`, async () => {
    const seed = Array.from({ length: MAX_OWN_PER_PAPER }, (_, i) => ({
      groupKey: PAPEL, itemLabel: `Procedimiento propio número ${i}`, itemSubtitle: 'Inspección',
      itemDetails: { v: 1, statement: `Enunciado propio número ${i} con suficiente largo para validar.`, development: 'd'.repeat(90), priority: 'LOW' },
    }));
    const { svc } = armar(seed);
    await expect(svc.createOwn(MANAGER, PAPEL, NUEVO)).rejects.toThrow(/máximo/);
    // Otro papel no se ve afectado por el tope.
    await expect(svc.createOwn(MANAGER, 'PT-NIA570', NUEVO)).resolves.toBeTruthy();
  });

  it('los propios salen por su orden (sortOrder), no por cuándo se crearon, y uno nuevo va al final', async () => {
    const propio = (n: string, sortOrder: number) => ({
      groupKey: PAPEL, itemLabel: `Procedimiento propio ${n} de prueba`, itemSubtitle: 'Inspección', sortOrder,
      itemDetails: { v: 1, statement: `Enunciado del procedimiento propio ${n} con largo suficiente.`, development: 'd'.repeat(90), priority: 'LOW' },
    });
    const { svc, db } = armar([propio('A', 5), propio('B', 1)]); // A se creó primero pero B va antes
    expect((await items(svc)).slice(-2).map((i) => i.title)).toEqual(['Procedimiento propio B de prueba', 'Procedimiento propio A de prueba']);
    await svc.createOwn(MANAGER, PAPEL, NUEVO);
    expect(db.rows.at(-1)!.sortOrder).toBe(6);
    expect((await items(svc)).at(-1)!.title).toBe(NUEVO.title);
  });

  it('edita uno propio: lo no enviado se conserva y el cambio se ve', async () => {
    const { svc } = armar();
    const { rowId } = await svc.createOwn(MANAGER, PAPEL, { ...NUEVO, ref: 'NIA 550' });
    await svc.updateOwn(MANAGER, rowId, { priority: 'HIGH', title: 'Revisar acuerdos verbales y cartas de la gerencia' });
    const propio = (await items(svc)).at(-1)!;
    expect(propio).toMatchObject({ priority: 'HIGH', title: 'Revisar acuerdos verbales y cartas de la gerencia', statement: NUEVO.statement, ref: 'NIA 550', technique: 'Indagación' });
  });

  it('al editar uno propio no choca consigo mismo, pero sí con otro', async () => {
    const { svc } = armar();
    const a = await svc.createOwn(MANAGER, PAPEL, NUEVO);
    await expect(svc.updateOwn(MANAGER, a.rowId, { priority: 'LOW' })).resolves.toBeTruthy();
    await expect(svc.updateOwn(MANAGER, a.rowId, { title: BASE[2].title })).rejects.toBeInstanceOf(ConflictException);
  });

  it('editar con datos inválidos no toca lo guardado', async () => {
    const { svc, db } = armar();
    const { rowId } = await svc.createOwn(MANAGER, PAPEL, NUEVO);
    await expect(svc.updateOwn(MANAGER, rowId, { title: 'x' })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.rows[0].itemLabel).toBe(NUEVO.title);
  });

  it('elimina uno propio', async () => {
    const { svc, db } = armar();
    const { rowId } = await svc.createOwn(MANAGER, PAPEL, NUEVO);
    await expect(svc.deleteOwn(MANAGER, rowId)).resolves.toEqual({ deleted: true });
    expect(db.rows).toHaveLength(0);
    expect(await items(svc)).toHaveLength(BASE.length);
  });

  it('una organización no puede ver, editar ni borrar lo de otra', async () => {
    const { svc, db } = armar();
    const { rowId } = await svc.createOwn(MANAGER, PAPEL, NUEVO);
    await expect(svc.updateOwn(OTRA_ORG, rowId, { priority: 'LOW' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.deleteOwn(OTRA_ORG, rowId)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.rows).toHaveLength(1);
    expect((db.rows[0].itemDetails as { priority: string }).priority).toBe('MEDIUM');
    expect((await items(svc, OTRA_ORG)).some((i) => i.origin === 'OWN')).toBe(false);
  });

  it('las rutas de procedimientos propios no sirven para tocar el ajuste de uno del sistema', async () => {
    const { svc } = armar();
    await svc.overrideBase(MANAGER, PAPEL, BASE[0].id, { hidden: true });
    const filaOculto = (await items(svc))[0].rowId!;
    await expect(svc.updateOwn(MANAGER, filaOculto, { priority: 'LOW' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.deleteOwn(MANAGER, filaOculto)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('no toca filas de otro tipo de la misma tabla (procedimientos sustantivos, COSO)', async () => {
    const { svc, db } = armar([{ id: 'sust1', kind: 'SUBSTANTIVE_PROCEDURE', groupKey: PAPEL, itemLabel: 'Procedimiento sustantivo del sistema' }]);
    await expect(svc.deleteOwn(MANAGER, 'sust1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.updateOwn(MANAGER, 'sust1', { priority: 'LOW' })).rejects.toBeInstanceOf(NotFoundException);
    expect(db.rows).toHaveLength(1);
    expect(await items(svc)).toHaveLength(BASE.length);
  });
});

describe('PaperLibraryAdminService — ajustes sobre lo que trae el sistema', () => {
  it('editar uno del sistema lo marca EDITED, guarda el original y no cambia el catálogo en código', async () => {
    const { svc, db } = armar();
    const nuevoTexto = { ...baseAsInput(1), statement: `${BASE[1].statement} Documentar también la fecha de corte.` };
    await svc.overrideBase(MANAGER, PAPEL, BASE[1].id, { content: nuevoTexto });
    const it1 = (await items(svc))[1];
    expect(it1).toMatchObject({ id: BASE[1].id, origin: 'EDITED', statement: nuevoTexto.statement });
    expect(it1.original?.statement).toBe(BASE[1].statement);
    expect(BASE[1].statement).not.toContain('fecha de corte.');
    expect(db.rows).toHaveLength(1);
    expect((db.rows[0].itemDetails as any).baseId).toBe(BASE[1].id);
  });

  it('editar de nuevo actualiza la misma fila (no se acumulan)', async () => {
    const { svc, db } = armar();
    await svc.overrideBase(MANAGER, PAPEL, BASE[1].id, { content: { ...baseAsInput(1), priority: 'LOW' } });
    await svc.overrideBase(MANAGER, PAPEL, BASE[1].id, { content: { ...baseAsInput(1), priority: 'HIGH', title: 'Título ajustado por la organización' } });
    expect(db.rows).toHaveLength(1);
    expect((await items(svc))[1]).toMatchObject({ origin: 'EDITED', priority: 'HIGH', title: 'Título ajustado por la organización' });
  });

  it('una edición idéntica al sistema no deja fila', async () => {
    const { svc, db } = armar();
    await svc.overrideBase(MANAGER, PAPEL, BASE[1].id, { content: baseAsInput(1) });
    expect(db.rows).toHaveLength(0);
    expect((await items(svc))[1].origin).toBe('BASE');
  });

  it('editar y volver al texto original borra el ajuste', async () => {
    const { svc, db } = armar();
    await svc.overrideBase(MANAGER, PAPEL, BASE[1].id, { content: { ...baseAsInput(1), priority: 'LOW' } });
    expect(db.rows).toHaveLength(1);
    const r = await svc.overrideBase(MANAGER, PAPEL, BASE[1].id, { content: baseAsInput(1) });
    expect(r).toEqual({ restored: true });
    expect(db.rows).toHaveLength(0);
  });

  it('ocultar y volver a mostrar', async () => {
    const { svc, db } = armar();
    await svc.overrideBase(MANAGER, PAPEL, BASE[0].id, { hidden: true });
    expect((await items(svc))[0]).toMatchObject({ id: BASE[0].id, hidden: true, origin: 'BASE' });
    expect(db.rows).toHaveLength(1);
    await svc.overrideBase(MANAGER, PAPEL, BASE[0].id, { hidden: false });
    expect(db.rows).toHaveLength(0);
    expect((await items(svc))[0].hidden).toBe(false);
  });

  it('ocultar uno ya editado conserva la edición; mostrarlo de nuevo la deja vigente', async () => {
    const { svc } = armar();
    await svc.overrideBase(MANAGER, PAPEL, BASE[1].id, { content: { ...baseAsInput(1), priority: 'LOW' } });
    await svc.overrideBase(MANAGER, PAPEL, BASE[1].id, { hidden: true });
    expect((await items(svc))[1]).toMatchObject({ origin: 'EDITED', hidden: true, priority: 'LOW' });
    await svc.overrideBase(MANAGER, PAPEL, BASE[1].id, { hidden: false });
    expect((await items(svc))[1]).toMatchObject({ origin: 'EDITED', hidden: false, priority: 'LOW' });
  });

  it('editar uno oculto no lo vuelve a mostrar', async () => {
    const { svc } = armar();
    await svc.overrideBase(MANAGER, PAPEL, BASE[1].id, { hidden: true });
    await svc.overrideBase(MANAGER, PAPEL, BASE[1].id, { content: { ...baseAsInput(1), priority: 'LOW' } });
    expect((await items(svc))[1]).toMatchObject({ origin: 'EDITED', hidden: true });
  });

  it('restaurar quita la edición y el ocultamiento a la vez', async () => {
    const { svc, db } = armar();
    await svc.overrideBase(MANAGER, PAPEL, BASE[1].id, { content: { ...baseAsInput(1), priority: 'LOW' } });
    await svc.overrideBase(MANAGER, PAPEL, BASE[1].id, { hidden: true });
    await expect(svc.restoreBase(MANAGER, PAPEL, BASE[1].id)).resolves.toEqual({ restored: true, removed: 1 });
    expect(db.rows).toHaveLength(0);
    expect((await items(svc))[1]).toMatchObject({ origin: 'BASE', hidden: false, statement: BASE[1].statement });
  });

  it('restaurar uno que nunca se tocó no falla', async () => {
    const { svc } = armar();
    await expect(svc.restoreBase(MANAGER, PAPEL, BASE[1].id)).resolves.toEqual({ restored: true, removed: 0 });
  });

  it('rechaza un procedimiento que no está en el catálogo del sistema y una orden vacía', async () => {
    const { svc } = armar();
    await expect(svc.overrideBase(MANAGER, PAPEL, 'PT-NIA550.99', { hidden: true })).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.overrideBase(MANAGER, 'PT-NO-EXISTE', 'PT-NO-EXISTE.01', { hidden: true })).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.restoreBase(MANAGER, PAPEL, 'PT-NIA550.99')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.overrideBase(MANAGER, PAPEL, BASE[0].id, {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('la edición se valida igual que un procedimiento nuevo y no deja duplicar a otro', async () => {
    const { svc, db } = armar();
    await expect(svc.overrideBase(MANAGER, PAPEL, BASE[1].id, { content: { ...baseAsInput(1), title: 'x' } })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.overrideBase(MANAGER, PAPEL, BASE[1].id, { content: { ...baseAsInput(1), title: BASE[2].title } })).rejects.toBeInstanceOf(ConflictException);
    expect(db.rows).toHaveLength(0);
  });

  it('el ajuste de una organización no afecta a otra', async () => {
    const { svc } = armar();
    await svc.overrideBase(MANAGER, PAPEL, BASE[0].id, { hidden: true });
    await svc.overrideBase(MANAGER, PAPEL, BASE[1].id, { content: { ...baseAsInput(1), priority: 'LOW' } });
    const otra = await items(svc, OTRA_ORG);
    expect(otra.every((i) => i.origin === 'BASE' && !i.hidden)).toBe(true);
    // Y restaurar desde la otra organización no borra lo de la primera.
    await svc.restoreBase(OTRA_ORG, PAPEL, BASE[0].id);
    expect((await items(svc))[0].hidden).toBe(true);
  });

  it('si por una carrera hay dos filas del mismo procedimiento, gana la más reciente y la siguiente edición limpia la vieja', async () => {
    const detalle = (priority: string) => ({ v: 1, baseId: BASE[1].id, statement: BASE[1].statement, development: BASE[1].development, priority });
    const { svc, db } = armar([
      { id: 'vieja', groupKey: PAPEL, itemLabel: BASE[1].title, itemSubtitle: BASE[1].technique, itemDetails: detalle('LOW'), updatedAt: new Date('2026-11-02') },
      { id: 'nueva', groupKey: PAPEL, itemLabel: BASE[1].title, itemSubtitle: BASE[1].technique, itemDetails: detalle('HIGH'), updatedAt: new Date('2026-11-05') },
    ]);
    expect((await items(svc))[1]).toMatchObject({ origin: 'EDITED', priority: 'HIGH', rowId: 'nueva' });
    await svc.overrideBase(MANAGER, PAPEL, BASE[1].id, { hidden: true });
    expect(db.rows.map((r) => r.id)).toEqual(['nueva']);
  });

  it('un ajuste de un procedimiento que el sistema ya no trae se ignora sin romper nada', async () => {
    const { svc } = armar([{ groupKey: PAPEL, itemLabel: 'Procedimiento retirado del sistema', itemDetails: { v: 1, baseId: 'PT-NIA550.77', hidden: true } }]);
    const lista = await items(svc);
    expect(lista).toHaveLength(BASE.length);
    expect(lista.some((i) => i.hidden)).toBe(false);
  });

  it('si el sistema actualiza su texto y queda igual al ajuste que tenía la organización, vuelve a mostrarse como del sistema', async () => {
    const { svc } = armar([{
      id: 'igual', groupKey: PAPEL, itemLabel: BASE[1].title, itemSubtitle: BASE[1].technique,
      itemDetails: { v: 1, baseId: BASE[1].id, statement: BASE[1].statement, development: BASE[1].development, ref: BASE[1].ref, priority: BASE[1].priority },
    }]);
    expect((await items(svc))[1]).toMatchObject({ origin: 'BASE', hidden: false });
  });

  it('solo se leen filas de biblioteca por papel: las de otro tipo con el mismo groupKey se ignoran', async () => {
    const { svc } = armar([{
      kind: 'SUBSTANTIVE_PROCEDURE', groupKey: PAPEL, itemLabel: 'Procedimiento sustantivo con el mismo groupKey', itemSubtitle: 'Inspección',
      itemDetails: { v: 1, statement: 'Enunciado con largo suficiente para parecer válido.', development: 'd'.repeat(90), priority: 'HIGH' },
    }]);
    expect(await items(svc)).toHaveLength(BASE.length);
  });

  it('filas dañadas (sin contenido legible) se ignoran y no tumban la lectura', async () => {
    const { svc } = armar([
      { groupKey: PAPEL, itemLabel: 'Fila sin detalle', itemDetails: null },
      { groupKey: PAPEL, itemLabel: 'Fila con lista en vez de objeto', itemDetails: ['a', 'b'] },
      { groupKey: PAPEL, itemLabel: 'Fila con técnica rara', itemSubtitle: 'Magia', itemDetails: { v: 1, statement: 'x'.repeat(40), development: 'y'.repeat(90), priority: 'HIGH' } },
    ]);
    expect(await items(svc)).toHaveLength(BASE.length);
  });
});

describe('biblioteca efectiva para «Generar sugerencias»', () => {
  it('quita los ocultos, deja las ediciones y los propios, y lista aparte los títulos ocultos', async () => {
    const { svc, db } = armar();
    await svc.overrideBase(MANAGER, PAPEL, BASE[0].id, { hidden: true });
    await svc.overrideBase(MANAGER, PAPEL, BASE[1].id, { content: { ...baseAsInput(1), title: 'Título ajustado por la organización' } });
    await svc.createOwn(MANAGER, PAPEL, NUEVO);
    const eff = effectiveEntry(await loadMergedPaper(db as unknown as OrgLibraryDb, 'org1', PAPEL));
    const titulos = eff.entry.procedures.map((p) => p.title);
    expect(titulos).not.toContain(BASE[0].title);
    expect(titulos).toContain('Título ajustado por la organización');
    expect(titulos.at(-1)).toBe(NUEVO.title);
    expect(eff.entry.procedures).toHaveLength(BASE.length - 1 + 1);
    expect(eff.hiddenTitles).toEqual([BASE[0].title]);
    expect(eff.entry.procedures.map((p) => p.origin)).toEqual(['EDITED', ...Array(BASE.length - 2).fill('BASE'), 'OWN']);
    // Lo interno de administración no viaja a las sugerencias.
    expect(Object.keys(eff.entry.procedures[0])).not.toEqual(expect.arrayContaining(['hidden', 'rowId', 'original']));
  });
});

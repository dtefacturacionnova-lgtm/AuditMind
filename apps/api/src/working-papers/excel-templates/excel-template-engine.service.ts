import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, WorkingPaperStatus } from '@prisma/client';
import { Workbook, Worksheet, CellValue as ExcelCellValue } from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/jwt.strategy';
import { PaperSectionsService } from '../paper-sections.service';
import { PAPER_TEMPLATES } from '../paper-templates';
import {
  ExcelTemplateDef, ExcelTemplateContext, ExcelRangoDef, ExcelSaldoTB,
  ExcelValorCelda, ExcelFilaLeida, ExcelValorLeido, ExcelAdvertencia,
  ExcelSeccionEscrita, ExcelGeneracionResultado, ExcelLecturaResultado,
  EXCEL_LIMITES_POR_DEFECTO, ExcelTemplateLimits, EXCEL_MISMO_PAPEL,
  EXCEL_MANIFEST_HOJA, EXCEL_MANIFEST_RANGO, EXCEL_MAGIC_ZIP,
} from './excel-template.types';
import { construirManifest, verificarManifest } from './excel-manifest';
import {
  parseCelda, rangoA1, parseRangoDefinido,
  sanearValorCelda, coaccionarPorFormato, numFmtPorFormato,
} from './excel-cell-utils';

/**
 * Motor genérico de plantillas Excel (EXC-02 — implementación de EXC-01).
 * Ver `docs/integracion-excel-plantillas-inteligentes.md` §3 y §3.1.
 *
 * Convención de layout que debe respetar cualquier `ExcelTemplateDef` (fases
 * 1-5, aún no escritas): en la PRIMERA hoja del libro, las filas 1-4 quedan
 * reservadas para la cabecera del encargo que este motor imprime — el primer
 * `ancla` de esa hoja no debe ser anterior a la fila 6. Además, si un rango
 * define `etiqueta`, el motor imprime un rótulo en la FILA inmediatamente
 * anterior a su `ancla` (tanto para ESCALAR como para TABLA, por simplicidad
 * y para no depender de que exista una columna a la izquierda) — esa fila
 * debe quedar libre en el layout del autor de la plantilla. Precisión sobre
 * el boceto original de EXC-01 (que sugería "columna" para ESCALAR).
 */
@Injectable()
export class ExcelTemplateEngineService {
  private readonly logger = new Logger(ExcelTemplateEngineService.name);
  private readonly manifestSecret: string;

  private static readonly ESTADOS_BLOQUEADOS: WorkingPaperStatus[] = [
    WorkingPaperStatus.SIGNED_OFF,
    WorkingPaperStatus.CLOSED,
    WorkingPaperStatus.ARCHIVED,
  ];

  constructor(
    private readonly prisma:        PrismaService,
    private readonly paperSections: PaperSectionsService,
    private readonly config:        ConfigService,
  ) {
    const dedicado = this.config.get<string>('EXCEL_MANIFEST_SECRET');
    if (!dedicado) {
      this.logger.warn(
        'EXCEL_MANIFEST_SECRET no está definido — se usa JWT_SECRET como respaldo para firmar '
        + 'el manifiesto de las plantillas Excel. Defina un secreto dedicado en producción.',
      );
    }
    this.manifestSecret = dedicado || this.config.get<string>('JWT_SECRET', '');
    if (!this.manifestSecret) {
      throw new Error(
        'No hay secreto disponible para firmar el manifiesto de plantillas Excel '
        + '(defina EXCEL_MANIFEST_SECRET o JWT_SECRET)',
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // API pública
  // ═══════════════════════════════════════════════════════════════════════

  async generar(
    def: ExcelTemplateDef, paperId: string, user: AuthUser, areaKey?: string,
  ): Promise<{ buffer: Buffer; resultado: ExcelGeneracionResultado }> {
    this.validarDef(def);
    const limites = this.limites(def);
    if (def.hojas.length > limites.maxHojas) {
      throw new BadRequestException(`La plantilla '${def.key}' excede el máximo de hojas permitido`);
    }

    const { ctx } = await this.construirContexto(def, paperId, user, areaKey);
    const advertencias: ExcelAdvertencia[] = [];

    const workbook = new Workbook();
    workbook.creator = 'AuditMind';
    workbook.created = ctx.generadoEn;

    const hojasExcel = new Map<string, Worksheet>();
    for (const hoja of def.hojas) {
      const ws = workbook.addWorksheet(hoja.nombre, {
        views: hoja.congelarEn ? [{ state: 'frozen', ...this.freezeDesdeAncla(hoja.congelarEn) }] : undefined,
      });
      if (hoja.anchoColumnas) {
        hoja.anchoColumnas.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
      }
      hojasExcel.set(hoja.nombre, ws);
    }

    const primeraHoja = hojasExcel.get(def.hojas[0].nombre)!;
    this.escribirCabeceraEncargo(primeraHoja, ctx, def.label);

    let rangosEscritos = 0;
    for (const binding of def.origen) {
      const ws = hojasExcel.get(binding.rango.hoja);
      if (!ws) continue; // ya validado en validarDef — defensivo
      const valorFuente = binding.fuente ? await binding.fuente(ctx) : undefined;
      this.escribirRango(workbook, ws, binding.rango, valorFuente, advertencias);
      rangosEscritos++;
    }

    for (const hoja of def.hojas) {
      if (hoja.proteger === false) continue;
      const ws = hojasExcel.get(hoja.nombre)!;
      // Las opciones de exceljs son banderas de PERMISO (true = se permite la
      // acción con la hoja protegida). Solo se permite seleccionar celdas.
      await ws.protect('', {
        selectLockedCells: true, selectUnlockedCells: true,
        formatCells: false, formatColumns: false, formatRows: false,
        insertColumns: false, insertRows: false, insertHyperlinks: false,
        deleteColumns: false, deleteRows: false, sort: false,
        autoFilter: false, pivotTables: false, objects: false, scenarios: false,
      });
    }

    const manifest = construirManifest(this.manifestSecret, {
      templateKey: def.key, templateVersion: def.version,
      paperId: ctx.paperId, auditId: ctx.auditId, organizationId: ctx.organizationId,
      generadoEn: ctx.generadoEn.toISOString(), generadoPor: user.id,
      areaKey: ctx.areaKey,
    });
    const hojaManifest = workbook.addWorksheet(EXCEL_MANIFEST_HOJA, { state: 'veryHidden' });
    hojaManifest.getCell(1, 1).value = JSON.stringify(manifest);
    workbook.definedNames.add(rangoA1(EXCEL_MANIFEST_HOJA, 1, 1, 1, 1), EXCEL_MANIFEST_RANGO);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    return {
      buffer,
      resultado: {
        templateKey: def.key,
        nombreArchivo: this.nombreArchivo(def, ctx),
        manifest, rangosEscritos, advertencias,
      },
    };
  }

  async leer(
    def: ExcelTemplateDef, paperId: string, user: AuthUser, buffer: Buffer,
  ): Promise<ExcelLecturaResultado> {
    this.validarDef(def);
    const limites = this.limites(def);

    if (!buffer?.length) throw new BadRequestException('El archivo está vacío');
    if (buffer.length > limites.maxUploadBytes) {
      throw new BadRequestException(
        `El archivo excede el tamaño máximo permitido (${Math.round(limites.maxUploadBytes / 1024 / 1024)} MB)`,
      );
    }
    if (!EXCEL_MAGIC_ZIP.every((b, i) => buffer[i] === b)) {
      throw new BadRequestException('El archivo no es un .xlsx válido');
    }

    const { ctx, wp } = await this.construirContexto(def, paperId, user);

    const workbook = new Workbook();
    await this.cargarConTimeout(workbook, buffer, limites.parseTimeoutMs);

    if (workbook.worksheets.length > limites.maxHojas + 1) {
      throw new BadRequestException('El archivo tiene más hojas de las que la plantilla admite');
    }

    const manifestCrudo = this.leerManifiestoCrudo(workbook);
    const verif = verificarManifest(this.manifestSecret, manifestCrudo, {
      templateKey: def.key, templateVersion: def.version,
      paperId: ctx.paperId, auditId: ctx.auditId, organizationId: ctx.organizationId,
    });
    if (!verif.ok) {
      throw new BadRequestException(`No se pudo validar el archivo: ${verif.razon}`);
    }

    // Declarado ANTES del contexto para que el cierre de `rangoLeido` capture
    // este mismo Map por referencia — se llena en el bucle de abajo, pero para
    // cuando `transformacion`/`validacion` lo consultan (bucle de destino) ya
    // está completo.
    const valoresPorRango = new Map<string, ExcelValorLeido>();

    // El área para la que se generó el archivo viaja SELLADA en el manifiesto
    // (la firma la cubre) — se restaura aquí para que `transformacion`/`validacion`
    // sepan a qué área (C-01, C-02…) pertenece lo que regresa.
    const ctxImport: ExcelTemplateContext = {
      ...ctx,
      ...(verif.manifest.areaKey ? { areaKey: verif.manifest.areaKey } : {}),
      rangoLeido: (rangoNombre) => valoresPorRango.get(rangoNombre) ?? null,
    };

    const origenPorNombre = new Map(def.origen.map(o => [o.rango.rangoNombre, o.rango]));
    const advertencias: ExcelAdvertencia[] = [];
    let celdasLeidas = 0;

    for (const binding of def.origen) {
      const disponibles = limites.maxCeldasLeidas - celdasLeidas;
      if (disponibles <= 0) {
        advertencias.push({ mensaje: 'Se alcanzó el límite de celdas leídas — el resto del archivo se ignoró' });
        break;
      }
      const extraido = this.extraerRango(workbook, binding.rango, advertencias, limites, disponibles);
      if (extraido) {
        valoresPorRango.set(binding.rango.rangoNombre, extraido.valor);
        celdasLeidas += extraido.celdas;
      }
    }

    const seccionesActualizadas: ExcelSeccionEscrita[] = [];
    for (const destino of def.destino) {
      const valorLeido = valoresPorRango.get(destino.rangoNombre);
      if (!valorLeido) {
        advertencias.push({ rangoNombre: destino.rangoNombre, mensaje: 'El rango no se encontró en el archivo subido — se omitió' });
        continue;
      }
      if (destino.validacion) {
        const error = destino.validacion(valorLeido, ctxImport);
        if (error) {
          advertencias.push({ rangoNombre: destino.rangoNombre, mensaje: error });
          continue;
        }
      }

      const paperCode = destino.escribeEn.paperCode === EXCEL_MISMO_PAPEL ? wp.paperCode! : destino.escribeEn.paperCode;
      const destPaper = paperCode === wp.paperCode
        ? wp
        : await this.prisma.workingPaper.findFirst({
            where: { auditId: wp.auditId, paperCode },
            select: { id: true, paperCode: true, status: true },
          });

      if (!destPaper) {
        advertencias.push({ rangoNombre: destino.rangoNombre, mensaje: `No se encontró el papel destino '${paperCode}' en esta auditoría — se omitió` });
        continue;
      }
      if (ExcelTemplateEngineService.ESTADOS_BLOQUEADOS.includes(destPaper.status)) {
        advertencias.push({ rangoNombre: destino.rangoNombre, mensaje: `El papel '${paperCode}' está ${destPaper.status} y no admite escritura — se omitió` });
        continue;
      }
      const tplSections = PAPER_TEMPLATES[paperCode];
      if (!tplSections?.some(t => t.sectionKey === destino.escribeEn.sectionKey)) {
        advertencias.push({
          rangoNombre: destino.rangoNombre,
          mensaje: `La sección '${destino.escribeEn.sectionKey}' no existe en la plantilla de '${paperCode}' — se omitió`,
        });
        continue;
      }

      let valorAEscribir: Prisma.InputJsonValue;
      if (destino.transformacion) {
        valorAEscribir = await destino.transformacion(valorLeido, ctxImport);
      } else {
        valorAEscribir = (valorLeido.tipo === 'TABLA' ? valorLeido.filas : valorLeido.valor) as Prisma.InputJsonValue;
      }

      if (destino.modo === 'FUSIONA_POR_CLAVE' && destino.claveFusion) {
        // Zona CONTROLADA en filas ya existentes: la BD es la fuente de verdad.
        // La protección de Excel es solo de usabilidad — si alguien la quitó y
        // alteró una columna controlada, ese valor NO debe sobreescribir la BD.
        const rangoDef = origenPorNombre.get(destino.rangoNombre);
        const clavesControladas = new Set<string>();
        if (rangoDef?.forma.tipo === 'TABLA') {
          for (const c of rangoDef.forma.columnas) {
            if ((c.zona ?? rangoDef.zona) === 'CONTROLADA') clavesControladas.add(c.clave);
          }
        }
        const actual = await this.prisma.paperSection.findUnique({
          where: { paperId_sectionKey: { paperId: destPaper.id, sectionKey: destino.escribeEn.sectionKey } },
        });
        const existentes = Array.isArray(actual?.value) ? actual!.value as Record<string, unknown>[] : [];
        const entrantes = Array.isArray(valorAEscribir) ? valorAEscribir as Record<string, unknown>[] : [];
        const fusion = this.fusionarPorClave(existentes, entrantes, destino.claveFusion, clavesControladas);
        if (fusion.omitidasSinClave > 0) {
          advertencias.push({
            rangoNombre: destino.rangoNombre,
            mensaje: `${fusion.omitidasSinClave} fila(s) sin valor en la columna llave '${destino.claveFusion}' se omitieron — sin llave no se pueden emparejar ni agregar (evita duplicados al re-subir)`,
          });
        }
        valorAEscribir = fusion.filas as unknown as Prisma.InputJsonValue;
      }

      await this.paperSections.updateSection(destPaper.id, destino.escribeEn.sectionKey, valorAEscribir, user);

      seccionesActualizadas.push({
        paperId: destPaper.id, paperCode, sectionKey: destino.escribeEn.sectionKey,
        rangoNombre: destino.rangoNombre,
        filas: valorLeido.tipo === 'TABLA' ? valorLeido.filas.length : undefined,
      });
    }

    return {
      templateKey: def.key, paperId, rangosLeidos: valoresPorRango.size,
      seccionesActualizadas, advertencias,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Validación estructural y límites
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Valida la ESTRUCTURA de la plantilla al arrancar cualquier operación.
   * Todo lo que valida aquí son errores del AUTOR de la plantilla (fases 1-5),
   * no del usuario — por eso lanza `Error` (→ 500), no `BadRequestException`:
   * una plantilla mal declarada nunca debe llegar a producción en silencio.
   */
  private validarDef(def: ExcelTemplateDef) {
    const err = (msg: string) => new Error(`Plantilla '${def.key}': ${msg}`);

    if (!def.hojas.length) throw err('debe declarar al menos una hoja');
    const HOJA_CHARS_INVALIDOS = /[[\]*?:/\\']/;
    const nombresHoja = new Set<string>();
    for (const h of def.hojas) {
      if (!h.nombre || h.nombre.length > 31 || HOJA_CHARS_INVALIDOS.test(h.nombre)) {
        throw err(`nombre de hoja inválido '${h.nombre}' (máx. 31 caracteres, sin []*?:/\\ ni comillas simples)`);
      }
      if (h.nombre === EXCEL_MANIFEST_HOJA) throw err(`el nombre de hoja '${EXCEL_MANIFEST_HOJA}' está reservado para el manifiesto`);
      if (nombresHoja.has(h.nombre)) throw err(`hoja '${h.nombre}' duplicada`);
      nombresHoja.add(h.nombre);
    }

    const rangoPorNombre = new Map<string, ExcelRangoDef>();
    for (const o of def.origen) {
      const r = o.rango;
      if (rangoPorNombre.has(r.rangoNombre)) throw err(`rango '${r.rangoNombre}' duplicado`);
      if (!/^AM_/.test(r.rangoNombre)) throw err(`rango '${r.rangoNombre}' no usa el prefijo AM_`);
      if (!nombresHoja.has(r.hoja)) throw err(`el rango '${r.rangoNombre}' referencia la hoja inexistente '${r.hoja}'`);

      let ancla: { col: number; row: number };
      try {
        ancla = parseCelda(r.ancla);
      } catch {
        throw err(`rango '${r.rangoNombre}': ancla inválida '${r.ancla}' (se espera notación A1, p. ej. 'B6')`);
      }
      // Convención de layout documentada en la cabecera de esta clase.
      if (r.hoja === def.hojas[0].nombre && ancla.row < 6) {
        throw err(`rango '${r.rangoNombre}': en la primera hoja las filas 1-5 están reservadas para la cabecera del encargo — el ancla debe estar en la fila 6 o después`);
      }
      if (r.etiqueta && ancla.row < 2) {
        throw err(`rango '${r.rangoNombre}': con etiqueta, el ancla debe estar en la fila 2 o después (la etiqueta se imprime en la fila anterior)`);
      }

      if (r.forma.tipo === 'TABLA') {
        const f = r.forma;
        if (!f.columnas.length) throw err(`rango '${r.rangoNombre}': una TABLA debe declarar columnas`);
        if (f.filasMinimas < 0 || f.filasMaximas < 1 || f.filasMaximas < f.filasMinimas) {
          throw err(`rango '${r.rangoNombre}': filasMinimas/filasMaximas inconsistentes`);
        }
        const claves = new Set<string>();
        for (const c of f.columnas) {
          if (!c.clave) throw err(`rango '${r.rangoNombre}': columna con clave vacía`);
          if (claves.has(c.clave)) throw err(`rango '${r.rangoNombre}': columna '${c.clave}' duplicada`);
          claves.add(c.clave);
          if (c.opciones?.length) {
            // Límite de la validación de datos "lista" de Excel: la fórmula inline
            // va separada por comas y no puede exceder ~255 caracteres.
            if (c.opciones.some(op => op.includes(','))) {
              throw err(`rango '${r.rangoNombre}', columna '${c.clave}': las opciones no pueden contener comas (separador de la lista de Excel)`);
            }
            if (c.opciones.join(',').length > 250) {
              throw err(`rango '${r.rangoNombre}', columna '${c.clave}': la lista de opciones excede los 250 caracteres que admite Excel`);
            }
          }
        }
      }
      rangoPorNombre.set(r.rangoNombre, r);
    }

    for (const d of def.destino) {
      const r = rangoPorNombre.get(d.rangoNombre);
      if (!r) throw err(`destino '${d.rangoNombre}' no está declarado en origen[]`);
      if (d.modo === 'FUSIONA_POR_CLAVE') {
        if (!d.claveFusion) throw err(`destino '${d.rangoNombre}' usa FUSIONA_POR_CLAVE sin claveFusion`);
        if (r.forma.tipo !== 'TABLA') throw err(`destino '${d.rangoNombre}': FUSIONA_POR_CLAVE solo aplica a rangos TABLA`);
        if (!r.forma.columnas.some(c => c.clave === d.claveFusion)) {
          throw err(`destino '${d.rangoNombre}': claveFusion '${d.claveFusion}' no es una columna del rango`);
        }
      }
    }
  }

  private limites(def: ExcelTemplateDef): ExcelTemplateLimits {
    return { ...EXCEL_LIMITES_POR_DEFECTO, ...(def.limites ?? {}) };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Contexto (identidad validada + accesores pre-scopeados)
  // ═══════════════════════════════════════════════════════════════════════

  private async construirContexto(
    def: ExcelTemplateDef, paperId: string, user: AuthUser, areaKey?: string,
  ) {
    const wp = await this.prisma.workingPaper.findUnique({
      where:   { id: paperId },
      include: { audit: { select: {
        id: true, organizationId: true, title: true,
        auditPeriodStart: true, auditPeriodEnd: true, auditEntityId: true,
      } } },
    });
    if (!wp) throw new NotFoundException('Papel de trabajo no encontrado');
    if (wp.audit.organizationId !== user.organizationId) throw new ForbiddenException();
    if (!wp.paperCode || !def.paperCodeAplicable.includes(wp.paperCode)) {
      throw new BadRequestException(`La plantilla '${def.key}' no aplica al papel '${wp.paperCode ?? wp.code}'`);
    }

    let clienteNombre: string | null = null;
    if (wp.audit.auditEntityId) {
      const entity = await this.prisma.auditEntity.findUnique({
        where: { id: wp.audit.auditEntityId }, select: { name: true },
      });
      clienteNombre = entity?.name ?? null;
    }

    const misSecciones = await this.prisma.paperSection.findMany({
      where: { paperId }, select: { sectionKey: true, value: true },
    });
    const seccionMap = new Map<string, unknown>(misSecciones.map(s => [s.sectionKey, s.value]));
    const asRows = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v as Record<string, unknown>[] : []);

    const cachePapel = new Map<string, Promise<{ id: string } | null>>();
    const resolverPapel = (paperCode: string) => {
      if (!cachePapel.has(paperCode)) {
        cachePapel.set(paperCode, this.prisma.workingPaper.findFirst({
          where: { auditId: wp.auditId, paperCode }, select: { id: true },
        }));
      }
      return cachePapel.get(paperCode)!;
    };
    const seccionDePapel = async (paperCode: string, sectionKey: string): Promise<unknown> => {
      const otro = await resolverPapel(paperCode);
      if (!otro) return null;
      const s = await this.prisma.paperSection.findUnique({
        where: { paperId_sectionKey: { paperId: otro.id, sectionKey } },
      });
      return s?.value ?? null;
    };

    const ctx: ExcelTemplateContext = {
      user, organizationId: user.organizationId, auditId: wp.auditId,
      paperId, paperCode: wp.paperCode, templateKey: def.key,
      generadoEn: new Date(), areaKey,
      audit: {
        auditId: wp.auditId, titulo: wp.audit.title, clienteNombre,
        periodoInicio: wp.audit.auditPeriodStart, periodoFin: wp.audit.auditPeriodEnd,
        moneda: 'USD',
      },
      seccion:       (key) => seccionMap.get(key) ?? null,
      filas:         (key) => asRows(seccionMap.get(key)),
      seccionDePapel,
      filasDePapel:  async (pc, sk) => asRows(await seccionDePapel(pc, sk)),
      saldosTB:      async () => asRows(await seccionDePapel('PT-FIN-B00', 'S2')) as unknown as ExcelSaldoTB[],
      materialidad:  async () => {
        const { mg, me, uae } = await this.paperSections.getMaterialidadByAudit(wp.auditId, user);
        return { mg, me, uae };
      },
      // Sobrescrito con un accesor real en leer() — durante generar() no hay
      // nada leído todavía.
      rangoLeido: () => null,
    };

    return { ctx, wp };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Escritura (generación)
  // ═══════════════════════════════════════════════════════════════════════

  private freezeDesdeAncla(ancla: string): { xSplit: number; ySplit: number } {
    const { col, row } = parseCelda(ancla);
    return { xSplit: col - 1, ySplit: row - 1 };
  }

  private escribirCabeceraEncargo(ws: Worksheet, ctx: ExcelTemplateContext, label: string) {
    ws.mergeCells(1, 1, 1, 6);
    const titulo = ws.getCell(1, 1);
    titulo.value = `AuditMind — ${label}`;
    titulo.font = { bold: true, size: 14 };
    titulo.protection = { locked: true };

    const filas: Array<[string, string]> = [
      ['Encargo',  ctx.audit.titulo],
      ['Cliente',  ctx.audit.clienteNombre ?? '—'],
      ['Generado', ctx.generadoEn.toLocaleString('es-SV')],
    ];
    filas.forEach(([etiqueta, valor], i) => {
      const fila = 2 + i;
      const c1 = ws.getCell(fila, 1);
      c1.value = etiqueta; c1.font = { bold: true }; c1.protection = { locked: true };
      const c2 = ws.getCell(fila, 2);
      c2.value = valor; c2.protection = { locked: true };
    });
  }

  private aValorCelda(v: unknown): ExcelCellValue {
    if (v instanceof Date || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean' || v == null) {
      return v as ExcelCellValue;
    }
    return String(v);
  }

  private escribirRango(
    workbook: Workbook, ws: Worksheet, rango: ExcelRangoDef, valorFuente: unknown,
    advertencias: ExcelAdvertencia[],
  ) {
    const { col: colAncla, row: filaAncla } = parseCelda(rango.ancla);

    if (rango.etiqueta && filaAncla > 1) {
      const bannerCols = rango.forma.tipo === 'TABLA' ? rango.forma.columnas.length : 1;
      const filaBanner = filaAncla - 1;
      if (bannerCols > 1) ws.mergeCells(filaBanner, colAncla, filaBanner, colAncla + bannerCols - 1);
      const banner = ws.getCell(filaBanner, colAncla);
      banner.value = rango.nota ? `${rango.etiqueta} — ${rango.nota}` : rango.etiqueta;
      banner.font = { italic: true, bold: true, size: 10 };
      banner.protection = { locked: true };
    }

    if (rango.forma.tipo === 'ESCALAR') {
      const cell = ws.getCell(filaAncla, colAncla);
      cell.value = this.aValorCelda(valorFuente);
      const fmt = numFmtPorFormato(rango.forma.formato);
      if (fmt) cell.numFmt = fmt;
      cell.protection = { locked: rango.zona === 'CONTROLADA' };
      workbook.definedNames.add(rangoA1(rango.hoja, colAncla, filaAncla, colAncla, filaAncla), rango.rangoNombre);
      return;
    }

    // TABLA
    const columnas = rango.forma.columnas;
    const filaHeader = filaAncla;
    const filaDatosDesde = filaAncla + 1;

    columnas.forEach((col, j) => {
      const headerCell = ws.getCell(filaHeader, colAncla + j);
      headerCell.value = col.encabezado;
      headerCell.font = { bold: true };
      headerCell.protection = { locked: true };
      headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
      if (col.ancho) ws.getColumn(colAncla + j).width = col.ancho;
      if (col.ayuda) headerCell.note = col.ayuda;
    });

    let filas: Record<string, unknown>[] = [];
    if (valorFuente !== undefined) {
      if (Array.isArray(valorFuente)) {
        filas = valorFuente as Record<string, unknown>[];
      } else {
        advertencias.push({ rangoNombre: rango.rangoNombre, mensaje: 'La fuente de datos no devolvió un arreglo — se generó la tabla vacía' });
      }
    }
    if (filas.length > rango.forma.filasMaximas) {
      advertencias.push({
        rangoNombre: rango.rangoNombre,
        mensaje: `La tabla tiene más filas (${filas.length}) que el máximo de la plantilla (${rango.forma.filasMaximas}) — se truncó`,
      });
      filas = filas.slice(0, rango.forma.filasMaximas);
    }

    const totalFilas = Math.max(filas.length, rango.forma.filasMinimas, 1);

    for (let i = 0; i < totalFilas; i++) {
      const filaExcel = filaDatosDesde + i;
      const datoFila = filas[i];
      columnas.forEach((col, j) => {
        const cell = ws.getCell(filaExcel, colAncla + j);
        const zonaCol = col.zona ?? rango.zona;
        if (datoFila && datoFila[col.clave] !== undefined) {
          cell.value = this.aValorCelda(datoFila[col.clave]);
        }
        const fmt = numFmtPorFormato(col.formato);
        if (fmt) cell.numFmt = fmt;
        cell.protection = { locked: zonaCol === 'CONTROLADA' };
        if (col.opciones?.length && zonaCol === 'LIBRE') {
          cell.dataValidation = { type: 'list', allowBlank: true, formulae: [`"${col.opciones.join(',')}"`] };
        }
      });
    }

    const filaFin = filaDatosDesde + totalFilas - 1;
    const colFin = colAncla + columnas.length - 1;
    workbook.definedNames.add(rangoA1(rango.hoja, colAncla, filaDatosDesde, colFin, filaFin), rango.rangoNombre);
  }

  private nombreArchivo(def: ExcelTemplateDef, ctx: ExcelTemplateContext): string {
    const fecha = ctx.generadoEn.toISOString().slice(0, 10);
    const slug = def.label
      .replace(/[áàäâã]/gi, 'a').replace(/[éèëê]/gi, 'e').replace(/[íìïî]/gi, 'i')
      .replace(/[óòöôõ]/gi, 'o').replace(/[úùüû]/gi, 'u').replace(/ñ/gi, 'n')
      .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return `AuditMind_${slug}_${ctx.paperCode}_${fecha}.xlsx`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Lectura (subida)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * `ExcelJS.load()` no es cancelable: este timeout evita que la petición
   * HTTP quede colgada, pero no detiene el trabajo de CPU en curso si ya
   * arrancó. Aislar el parseo en un worker thread queda pendiente — ver
   * §3.1.4 del documento de diseño (abierto en EXC-01, no resuelto aquí).
   */
  private async cargarConTimeout(workbook: Workbook, buffer: Buffer, timeoutMs: number) {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new BadRequestException('El archivo tardó demasiado en procesarse')), timeoutMs);
    });
    try {
      // exceljs redeclara `Buffer extends ArrayBuffer` en su propio .d.ts, lo que choca
      // estructuralmente con el `Buffer` real de @types/node — es un desajuste conocido
      // de sus tipos, no un error real; se resuelve con el cast puntual de abajo.
      await Promise.race([workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]), timeout]);
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException('No se pudo leer el archivo — verifique que sea un .xlsx válido y no esté dañado');
    } finally {
      clearTimeout(timer!);
    }
  }

  private leerManifiestoCrudo(workbook: Workbook): unknown {
    try {
      const rangos = workbook.definedNames.getRanges(EXCEL_MANIFEST_RANGO);
      const rangoStr = rangos?.ranges?.[0];
      if (!rangoStr) return null;
      const parsed = parseRangoDefinido(rangoStr);
      if (!parsed) return null;
      const ws = workbook.getWorksheet(parsed.hoja);
      if (!ws) return null;
      const raw = ws.getCell(parsed.filaDesde, parsed.colDesde).value;
      if (typeof raw !== 'string') return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private extraerRango(
    workbook: Workbook, rango: ExcelRangoDef, advertencias: ExcelAdvertencia[],
    limites: ExcelTemplateLimits, celdasDisponibles: number,
  ): { valor: ExcelValorLeido; celdas: number } | null {
    const rangos = workbook.definedNames.getRanges(rango.rangoNombre);
    const rangoStr = rangos?.ranges?.[0];
    if (!rangoStr) return null;
    const parsed = parseRangoDefinido(rangoStr);
    if (!parsed) return null;
    const ws = workbook.getWorksheet(parsed.hoja);
    if (!ws) return null;

    if (rango.forma.tipo === 'ESCALAR') {
      const cell = ws.getCell(parsed.filaDesde, parsed.colDesde);
      const crudo = sanearValorCelda(cell.value, rango.rangoNombre, cell.address, advertencias);
      const valor = coaccionarPorFormato(crudo, rango.forma.formato);
      return { valor: { tipo: 'ESCALAR', valor }, celdas: 1 };
    }

    const columnas = rango.forma.columnas;
    const numFilasEnArchivo = parsed.filaHasta - parsed.filaDesde + 1;
    const numFilasTope = Math.min(numFilasEnArchivo, rango.forma.filasMaximas, limites.maxFilasPorTabla);
    const filas: ExcelFilaLeida[] = [];
    let celdas = 0;

    for (let i = 0; i < numFilasTope; i++) {
      if (celdas >= celdasDisponibles) {
        advertencias.push({ rangoNombre: rango.rangoNombre, mensaje: 'Se alcanzó el límite de celdas leídas antes de terminar esta tabla' });
        break;
      }
      const filaExcel = parsed.filaDesde + i;
      const filaObj: ExcelFilaLeida = {};
      let filaVacia = true;
      columnas.forEach((col, j) => {
        const colExcel = parsed.colDesde + j;
        if (colExcel > parsed.colHasta) return;
        const cell = ws.getCell(filaExcel, colExcel);
        const crudo = sanearValorCelda(cell.value, rango.rangoNombre, cell.address, advertencias);
        let valor = coaccionarPorFormato(crudo, col.formato);
        if (valor !== null && valor !== '') filaVacia = false;
        if (typeof valor === 'string' && valor.length > limites.maxLargoTextoCelda) {
          valor = valor.slice(0, limites.maxLargoTextoCelda);
        }
        filaObj[col.clave] = valor;
        celdas++;
      });
      if (!filaVacia) filas.push(filaObj);
    }

    return { valor: { tipo: 'TABLA', filas }, celdas };
  }

  /**
   * Merge fila a fila por `claveFusion`:
   * - Fila emparejada: se copian SOLO las columnas de zona LIBRE (las
   *   CONTROLADAS no se tocan — la BD es la fuente de verdad; ver el llamador).
   *   Los campos que solo existen en la app se preservan siempre.
   * - Fila nueva (clave sin correspondencia): se agrega completa — es obra del
   *   auditor. Se registra en `porClave` para que una clave repetida dentro del
   *   mismo archivo no genere duplicados.
   * - Fila sin clave: se omite y se cuenta — agregarla haría que cada re-subida
   *   del mismo archivo duplicara filas imposibles de emparejar.
   */
  private fusionarPorClave(
    existentes: Record<string, unknown>[],
    entrantes: Record<string, unknown>[],
    claveFusion: string,
    clavesControladas: Set<string>,
  ): { filas: Record<string, unknown>[]; omitidasSinClave: number } {
    const porClave = new Map(existentes.map(r => [String(r[claveFusion] ?? '').trim(), r]));
    const resultado = [...existentes];
    let omitidasSinClave = 0;

    for (const fila of entrantes) {
      const clave = String(fila[claveFusion] ?? '').trim();
      if (!clave) {
        omitidasSinClave++;
        continue;
      }
      const existente = porClave.get(clave);
      if (existente) {
        for (const [k, v] of Object.entries(fila)) {
          if (clavesControladas.has(k)) continue;
          existente[k] = v;
        }
      } else {
        const nueva = { ...fila };
        resultado.push(nueva);
        porClave.set(clave, nueva);
      }
    }
    return { filas: resultado, omitidasSinClave };
  }
}

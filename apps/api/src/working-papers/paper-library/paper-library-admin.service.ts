import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/jwt.strategy';
import { PAPER_CATALOGUE } from '../paper-catalogue';
import { PAPER_LIBRARY } from './index';
import {
  MAX_OWN_PER_PAPER, MAX_ROWS_PER_ORG, MergedPaper, OrgLibraryDb, OrgLibraryRow, OrgProcedureInput, PAPER_CODE_RE,
  PAPER_PROCEDURE_KIND, buildPayload, cleanOrgInput, findDuplicate, loadMergedPaper, loadOrgRows, mergePaper, parseRow, sameContent,
  validateOrgProcedure,
} from './org-library';

export interface PaperLibrarySummary {
  paperCode: string;
  title: string | null;
  /** Procedimientos del sistema para este papel (0 si el papel no tiene catálogo). */
  baseCount: number;
  /** Del sistema que la organización ajustó. */
  editedCount: number;
  /** Del sistema que la organización ocultó. */
  hiddenCount: number;
  /** Creados por la organización. */
  ownCount: number;
}

/** Administración de la biblioteca por papel de UNA organización (ver org-library.ts para el modelo). Escribir exige Gerente: lo decide el controlador. */
@Injectable()
export class PaperLibraryAdminService {
  constructor(private readonly prisma: PrismaService) {}

  private get db(): OrgLibraryDb {
    return this.prisma as unknown as OrgLibraryDb;
  }

  private titleOf(paperCode: string): string | null {
    return PAPER_CATALOGUE.find((p) => p.code === paperCode)?.title ?? null;
  }

  private assertCode(paperCode: string) {
    if (!PAPER_CODE_RE.test(paperCode)) throw new BadRequestException('Código de papel inválido.');
  }

  private validOrThrow(raw: Partial<OrgProcedureInput>): OrgProcedureInput {
    const input = cleanOrgInput(raw);
    const problems = validateOrgProcedure(input);
    if (problems.length > 0) throw new BadRequestException(problems.join(' '));
    return input as OrgProcedureInput;
  }

  // ─── Lectura ───────────────────────────────────────────────────────────────

  /** Un renglón por papel que tiene biblioteca del sistema o ajustes de la organización. */
  async listPapers(user: AuthUser): Promise<PaperLibrarySummary[]> {
    const rows = await loadOrgRows(this.db, user.organizationId);
    const codes = new Set<string>([...Object.keys(PAPER_LIBRARY), ...rows.map((r) => r.groupKey)]);
    return [...codes].sort().map((code) => {
      const merged = mergePaper(code, rows);
      return {
        paperCode: code,
        title: this.titleOf(code),
        baseCount: PAPER_LIBRARY[code]?.procedures.length ?? 0,
        editedCount: merged.items.filter((i) => i.origin === 'EDITED').length,
        hiddenCount: merged.items.filter((i) => i.hidden).length,
        ownCount: merged.items.filter((i) => i.origin === 'OWN').length,
      };
    });
  }

  async getPaper(user: AuthUser, paperCode: string): Promise<MergedPaper & { title: string | null }> {
    this.assertCode(paperCode);
    const merged = await loadMergedPaper(this.db, user.organizationId, paperCode);
    return { ...merged, title: this.titleOf(paperCode) };
  }

  // ─── Procedimientos propios ────────────────────────────────────────────────

  async createOwn(user: AuthUser, paperCode: string, raw: Partial<OrgProcedureInput>) {
    this.assertCode(paperCode);
    const input = this.validOrThrow(raw);
    const [rows, total] = await Promise.all([
      loadOrgRows(this.db, user.organizationId, paperCode),
      this.prisma.contentLibraryItem.count({ where: { organizationId: user.organizationId, kind: PAPER_PROCEDURE_KIND } }),
    ]);
    const merged = mergePaper(paperCode, rows);
    const own = merged.items.filter((i) => i.origin === 'OWN');
    if (own.length >= MAX_OWN_PER_PAPER) throw new BadRequestException(`Este papel ya tiene ${MAX_OWN_PER_PAPER} procedimientos propios (el máximo).`);
    if (total >= MAX_ROWS_PER_ORG) throw new BadRequestException('La organización alcanzó el máximo de ajustes de biblioteca.');
    const dup = findDuplicate(merged.items, input);
    if (dup) throw new ConflictException(`Ya existe en este papel «${dup.title}» con el mismo título o enunciado.`);

    const sortOrder = rows.reduce((m, r) => (r.sortOrder > m ? r.sortOrder : m), 0) + 1;
    const row = await this.prisma.contentLibraryItem.create({
      data: {
        organizationId: user.organizationId,
        kind: PAPER_PROCEDURE_KIND,
        groupKey: paperCode,
        groupLabel: this.titleOf(paperCode),
        itemLabel: input.title,
        itemSubtitle: input.technique,
        itemDetails: buildPayload(input, {}) as unknown as Prisma.InputJsonValue,
        sortOrder,
        isSystem: false,
        createdById: user.id,
      },
    });
    return { id: `org-${row.id}`, rowId: row.id };
  }

  private async ownRow(user: AuthUser, rowId: string): Promise<OrgLibraryRow> {
    const row = await this.prisma.contentLibraryItem.findFirst({
      where: { id: rowId, organizationId: user.organizationId, kind: PAPER_PROCEDURE_KIND },
    });
    if (!row) throw new NotFoundException('Procedimiento de biblioteca no encontrado.');
    if (parseRow(row).baseId) {
      throw new BadRequestException('Ese ajuste corresponde a un procedimiento del sistema: edítalo u ocúltalo desde el procedimiento original.');
    }
    return row;
  }

  async updateOwn(user: AuthUser, rowId: string, raw: Partial<OrgProcedureInput>) {
    const row = await this.ownRow(user, rowId);
    const current = parseRow(row).content;
    // PATCH parcial: lo no enviado se queda como estaba.
    const input = this.validOrThrow({ ...current, ...stripUndefined(raw) });
    const merged = mergePaper(row.groupKey, await loadOrgRows(this.db, user.organizationId, row.groupKey));
    const dup = findDuplicate(merged.items, input, `org-${row.id}`);
    if (dup) throw new ConflictException(`Ya existe en este papel «${dup.title}» con el mismo título o enunciado.`);
    await this.prisma.contentLibraryItem.update({
      where: { id: row.id },
      data: {
        itemLabel: input.title,
        itemSubtitle: input.technique,
        itemDetails: buildPayload(input, {}) as unknown as Prisma.InputJsonValue,
      },
    });
    return { id: `org-${row.id}`, rowId: row.id };
  }

  async deleteOwn(user: AuthUser, rowId: string) {
    const row = await this.ownRow(user, rowId);
    await this.prisma.contentLibraryItem.delete({ where: { id: row.id } });
    return { deleted: true };
  }

  // ─── Ajustes sobre lo que trae el sistema ──────────────────────────────────

  /**
   * Edita y/u oculta un procedimiento del sistema para ESTA organización. `content` reemplaza el texto (completo); `hidden` lo oculta o
   * lo vuelve a mostrar. Lo que no se envía se conserva. Si el resultado no cambia nada respecto al sistema, la fila se elimina.
   */
  async overrideBase(user: AuthUser, paperCode: string, baseId: string, change: { hidden?: boolean; content?: Partial<OrgProcedureInput> }) {
    this.assertCode(paperCode);
    const base = PAPER_LIBRARY[paperCode]?.procedures.find((p) => p.id === baseId);
    if (!base) throw new NotFoundException('Ese procedimiento no existe en el catálogo del sistema para este papel.');
    if (change.hidden === undefined && change.content === undefined) throw new BadRequestException('No hay nada que cambiar.');

    const rows = await loadOrgRows(this.db, user.organizationId, paperCode);
    const mine = rows
      .map(parseRow)
      .filter((p) => p.baseId === baseId)
      .sort((a, b) => b.row.updatedAt.getTime() - a.row.updatedAt.getTime());
    const current = mine[0];

    let content = current?.content;
    if (change.content !== undefined) {
      const input = this.validOrThrow(change.content);
      const merged = mergePaper(paperCode, rows);
      const dup = findDuplicate(merged.items, input, baseId);
      if (dup) throw new ConflictException(`Ya existe en este papel «${dup.title}» con el mismo título o enunciado.`);
      content = sameContent(input, base) ? undefined : input;
    }
    const hidden = change.hidden ?? current?.hidden ?? false;

    // Ya no difiere del sistema: se borran las filas de este procedimiento.
    if (!content && !hidden) {
      if (mine.length > 0) await this.prisma.contentLibraryItem.deleteMany({ where: { id: { in: mine.map((m) => m.row.id) }, organizationId: user.organizationId } });
      return { restored: true };
    }

    if (rows.length >= MAX_ROWS_PER_ORG) throw new BadRequestException('La organización alcanzó el máximo de ajustes de biblioteca.');
    const data = {
      groupLabel: this.titleOf(paperCode),
      itemLabel: content?.title ?? base.title,
      itemSubtitle: content?.technique ?? base.technique,
      itemDetails: buildPayload(content, { baseId, hidden }) as unknown as Prisma.InputJsonValue,
    };
    if (current) {
      await this.prisma.contentLibraryItem.update({ where: { id: current.row.id }, data });
      // Si una carrera dejó filas repetidas para el mismo procedimiento, se limpian las más viejas.
      if (mine.length > 1) {
        await this.prisma.contentLibraryItem.deleteMany({ where: { id: { in: mine.slice(1).map((m) => m.row.id) }, organizationId: user.organizationId } });
      }
    } else {
      await this.prisma.contentLibraryItem.create({
        data: { ...data, organizationId: user.organizationId, kind: PAPER_PROCEDURE_KIND, groupKey: paperCode, sortOrder: 0, isSystem: false, createdById: user.id },
      });
    }
    return { restored: false, hidden, edited: !!content };
  }

  /** Quita todo ajuste de la organización sobre un procedimiento del sistema: vuelve el texto original y deja de estar oculto. */
  async restoreBase(user: AuthUser, paperCode: string, baseId: string) {
    this.assertCode(paperCode);
    if (!PAPER_LIBRARY[paperCode]?.procedures.some((p) => p.id === baseId)) {
      throw new NotFoundException('Ese procedimiento no existe en el catálogo del sistema para este papel.');
    }
    const rows = (await loadOrgRows(this.db, user.organizationId, paperCode)).filter((r) => parseRow(r).baseId === baseId);
    if (rows.length > 0) await this.prisma.contentLibraryItem.deleteMany({ where: { id: { in: rows.map((r) => r.id) }, organizationId: user.organizationId } });
    return { restored: true, removed: rows.length };
  }
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

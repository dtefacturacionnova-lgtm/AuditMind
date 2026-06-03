/**
 * DgiiService — cache local del padrón de contribuyentes activos de DGII.
 *
 * Permite:
 *   1. Importación masiva del padrón vía CSV/JSON (admin)
 *   2. Verificación batch de proveedores contra el padrón
 *   3. Consulta individual por NIT o NRC
 *
 * Datos esperados del CSV (mínimo nit + nombre + estado):
 *   nit, nrc, nombre, estado, giro, categoria, fechaInscripcion, direccion
 */
import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/jwt.strategy';

export interface ImportPayload {
  contribuyentes: Array<{
    nit:              string;
    nrc?:             string;
    nombre:           string;
    estado:           string;
    giro?:            string;
    categoria?:       string;
    fechaInscripcion?: string;
    direccion?:       string;
  }>;
  replaceAll?: boolean;  // si true, borra todo el padrón previo de la org
}

export interface VerifyBatchInput {
  nits: string[];  // lista de NITs a verificar
}

export interface VerifyResult {
  found:      Array<{
    nit: string; nrc: string | null; nombre: string;
    estado: string; giro: string | null;
    isActive: boolean;
  }>;
  notFound:   string[];          // NITs no encontrados (posibles facturas de favor)
  suspended:  string[];          // NITs encontrados pero SUSPENDIDOS/CANCELADOS
  active:     string[];          // NITs ACTIVOS (OK)
  summary: {
    total:      number;
    activeCount: number;
    suspendedCount: number;
    notFoundCount: number;
  };
}

@Injectable()
export class DgiiService {
  constructor(private prisma: PrismaService) {}

  // ─── Padrón management ──────────────────────────────────────────────────

  async import(input: ImportPayload, user: AuthUser) {
    if (!input.contribuyentes || input.contribuyentes.length === 0) {
      throw new BadRequestException('Lista de contribuyentes vacía');
    }

    if (input.replaceAll) {
      await this.prisma.dgiiContribuyente.deleteMany({
        where: { organizationId: user.organizationId },
      });
    }

    // Normalize NITs: strip non-digits
    const records = input.contribuyentes
      .filter(c => c.nit && c.nombre)
      .map(c => ({
        organizationId: user.organizationId,
        nit:    c.nit.replace(/\D/g, '').slice(-14),
        nrc:    c.nrc?.replace(/\D/g, '') || null,
        nombre: c.nombre.trim(),
        estado: (c.estado || 'ACTIVO').toUpperCase(),
        giro:   c.giro?.trim() || null,
        categoria: c.categoria?.trim() || null,
        fechaInscripcion: c.fechaInscripcion ? new Date(c.fechaInscripcion) : null,
        direccion: c.direccion?.trim() || null,
      }))
      .filter(r => r.nit.length >= 9); // NIT mínimo válido

    if (records.length === 0) {
      throw new BadRequestException('Ningún registro válido tras normalización');
    }

    // Upsert batch — 1000 por batch para no agotar memoria
    let created = 0;
    let updated = 0;
    for (let i = 0; i < records.length; i += 500) {
      const chunk = records.slice(i, i + 500);
      for (const rec of chunk) {
        const result = await this.prisma.dgiiContribuyente.upsert({
          where: { organizationId_nit: { organizationId: rec.organizationId, nit: rec.nit } },
          create: rec,
          update: {
            nrc:    rec.nrc,
            nombre: rec.nombre,
            estado: rec.estado,
            giro:   rec.giro,
            categoria: rec.categoria,
            fechaInscripcion: rec.fechaInscripcion,
            direccion: rec.direccion,
            fechaCambioEstado: new Date(),
          },
        });
        if (result.importedAt.getTime() > Date.now() - 1000) created++;
        else updated++;
      }
    }

    return {
      imported: records.length,
      created,
      updated,
      replacedAll: !!input.replaceAll,
    };
  }

  async getStats(user: AuthUser) {
    const total = await this.prisma.dgiiContribuyente.count({
      where: { organizationId: user.organizationId },
    });
    const lastImport = await this.prisma.dgiiContribuyente.findFirst({
      where:   { organizationId: user.organizationId },
      orderBy: { importedAt: 'desc' },
      select:  { importedAt: true },
    });
    const byEstado = await this.prisma.dgiiContribuyente.groupBy({
      by:    ['estado'],
      where: { organizationId: user.organizationId },
      _count: { estado: true },
    });

    return {
      total,
      lastImportAt: lastImport?.importedAt?.toISOString() ?? null,
      byEstado: byEstado.reduce((acc, r) => {
        acc[r.estado] = r._count.estado;
        return acc;
      }, {} as Record<string, number>),
    };
  }

  // ─── Verification ───────────────────────────────────────────────────────

  async verifyBatch(input: VerifyBatchInput, user: AuthUser): Promise<VerifyResult> {
    const nits = input.nits.map(n => n.replace(/\D/g, '').slice(-14)).filter(n => n.length >= 9);
    const uniqueNits = Array.from(new Set(nits));

    const found = await this.prisma.dgiiContribuyente.findMany({
      where: {
        organizationId: user.organizationId,
        nit: { in: uniqueNits },
      },
      select: {
        nit: true, nrc: true, nombre: true, estado: true, giro: true,
      },
    });

    const foundNits = new Set(found.map(c => c.nit));
    const notFound = uniqueNits.filter(n => !foundNits.has(n));

    const result: VerifyResult = {
      found:     [],
      notFound,
      suspended: [],
      active:    [],
      summary: {
        total:           uniqueNits.length,
        activeCount:     0,
        suspendedCount:  0,
        notFoundCount:   notFound.length,
      },
    };

    for (const c of found) {
      const isActive = c.estado === 'ACTIVO' || c.estado === 'INSCRITO';
      result.found.push({ ...c, isActive });
      if (isActive) {
        result.active.push(c.nit);
        result.summary.activeCount++;
      } else {
        result.suspended.push(c.nit);
        result.summary.suspendedCount++;
      }
    }

    return result;
  }

  async findOne(nit: string, user: AuthUser) {
    const normalized = nit.replace(/\D/g, '').slice(-14);
    const c = await this.prisma.dgiiContribuyente.findFirst({
      where: { organizationId: user.organizationId, nit: normalized },
    });
    if (!c) throw new NotFoundException(`NIT ${nit} no encontrado en padrón DGII de la organización`);
    if (c.organizationId !== user.organizationId) throw new ForbiddenException();
    return c;
  }
}

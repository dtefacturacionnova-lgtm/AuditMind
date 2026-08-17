import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/jwt.strategy';
import { AuditBackupPackageService } from './audit-backup-package.service';
import { AuditBackupFilesService } from './audit-backup-files.service';
import { verificarBackupManifest } from './audit-backup-manifest';
import { AUDIT_SCOPED_MODELS, AuditBackupAdvertencia } from './audit-backup.types';
import { obtenerFksDeModelo } from './audit-backup-schema';

/**
 * Restaurar un backup COMO ENCARGO NUEVO (BKP-07/08) — nunca sobrescribe
 * nada existente. Ver `audit-backup.types.ts` §BKP-02 para las 5 decisiones
 * de diseño que rigen este archivo (alcance mismo-org, remapeo de IDs,
 * conservación de usuarios, referencias colgantes).
 *
 * Orden de trabajo: (1) crear TODAS las filas con sus FKs remapeadas —
 * construye el `idMap` completo — (2) recién con el `idMap` completo,
 * recalcular las rutas de Storage (necesitan el `paperId` NUEVO) y subir los
 * archivos — (3) parchear las URLs/rutas dentro de `PaperSection.value`/
 * `attachments` ya insertadas para que apunten a los archivos recién
 * subidos, no a las rutas del backup (que pertenecen al encargo original).
 */
@Injectable()
export class AuditBackupRestoreService {
  private readonly logger = new Logger(AuditBackupRestoreService.name);
  private readonly manifestSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly packageSvc: AuditBackupPackageService,
    private readonly filesSvc: AuditBackupFilesService,
    private readonly config: ConfigService,
  ) {
    this.manifestSecret = this.config.get<string>('AUDIT_BACKUP_SECRET') || this.config.get<string>('JWT_SECRET', '');
  }

  async restaurarComoNuevo(buffer: Buffer, user: AuthUser, nuevoTitulo?: string) {
    const { manifestCrudo, dataJson, archivos } = await this.packageSvc.desempaquetar(buffer);
    const hashReal = crypto.createHash('sha256').update(dataJson).digest('hex');
    const verif = verificarBackupManifest(
      this.manifestSecret, manifestCrudo,
      { auditId: '', organizationId: user.organizationId }, // auditId no se compara — ver audit-backup-manifest.ts
      hashReal,
    );
    if (!verif.ok) throw new BadRequestException(`No se pudo validar el backup: ${verif.razon}`);

    let data: Record<string, Record<string, unknown>[]>;
    try {
      data = JSON.parse(dataJson);
    } catch {
      throw new BadRequestException('El contenido del backup no se pudo interpretar');
    }
    const auditOriginal = data.audit?.[0];
    if (!auditOriginal) throw new BadRequestException('El backup no contiene el registro del encargo');

    const advertencias: AuditBackupAdvertencia[] = [];
    const idMap = new Map<string, string>();

    // Conjuntos de referencia válidos en la organización ACTUAL — una sola
    // consulta cada uno, nunca una por fila (ver audit-backup.types.ts punto 4).
    const [usuarios, entidades, plantillas] = await Promise.all([
      this.prisma.user.findMany({ where: { organizationId: user.organizationId }, select: { id: true } }),
      this.prisma.auditEntity.findMany({ where: { organizationId: user.organizationId }, select: { id: true } }),
      this.prisma.auditTemplate.findMany({ where: { organizationId: user.organizationId }, select: { id: true } }),
    ]);
    const conjuntosPorModelo: Record<string, Set<string>> = {
      User: new Set(usuarios.map(u => u.id)),
      AuditEntity: new Set(entidades.map(e => e.id)),
      AuditTemplate: new Set(plantillas.map(t => t.id)),
    };

    // ── 1. Crear el Audit ────────────────────────────────────────────────
    const auditData = this.remapearFila('audit', auditOriginal, idMap, conjuntosPorModelo, user, advertencias);
    if (!auditData) throw new BadRequestException('No se pudo reconstruir el registro del encargo desde el backup');
    auditData.organizationId = user.organizationId;
    auditData.title = nuevoTitulo?.trim() || `${String(auditOriginal.title)} (restaurado)`;
    auditData.planId = null; // fuera de alcance — no se re-vincula a un plan anual automáticamente
    const nuevoAudit = await this.prisma.audit.create({ data: auditData as never });
    idMap.set(auditOriginal.id as string, nuevoAudit.id);

    // ── 2. Resto del árbol, en el orden de dependencia ya establecido ───
    let totalFilasCreadas = 1; // el Audit ya cuenta
    for (const modelo of AUDIT_SCOPED_MODELS) {
      let filas = data[modelo.model] ?? [];
      // AuditFolder se autorreferencia (parentId → otra fila del MISMO modelo)
      // — el orden entre niveles ya está resuelto, pero ESTO es dentro de un
      // solo modelo, así que necesita su propio orden topológico (padres antes
      // que hijos) para que parentId se pueda remapear la primera vez.
      if (modelo.model === 'auditFolder') filas = this.ordenarPorJerarquia(filas);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const delegate = (this.prisma as any)[modelo.model];
      if (!delegate?.create) {
        if (filas.length > 0) advertencias.push({ modelo: modelo.model, mensaje: 'Modelo no reconocido por el Prisma Client actual — filas omitidas' });
        continue;
      }
      for (const filaOriginal of filas) {
        const remapeada = this.remapearFila(modelo.model, filaOriginal, idMap, conjuntosPorModelo, user, advertencias);
        if (!remapeada) continue; // ya se registró la advertencia dentro de remapearFila
        try {
          const creada = await delegate.create({ data: remapeada });
          idMap.set(filaOriginal.id as string, creada.id);
          totalFilasCreadas++;
        } catch (e) {
          advertencias.push({ modelo: modelo.model, filaId: filaOriginal.id as string, mensaje: `No se pudo restaurar: ${(e as Error).message}` });
        }
      }
    }

    // ── 3. Archivos: recalcular ruta con el paperId NUEVO, subir, parchear URLs ──
    const mapaRutas = new Map<string, string>();
    for (const rutaVieja of archivos.keys()) {
      mapaRutas.set(rutaVieja, this.recalcularRuta(rutaVieja, idMap, nuevoAudit.id));
    }
    let totalArchivosSubidos = 0;
    for (const [rutaVieja, contenido] of archivos) {
      const rutaNueva = mapaRutas.get(rutaVieja)!;
      try {
        await this.filesSvc.subirArchivo(rutaNueva, contenido, 'application/octet-stream');
        totalArchivosSubidos++;
      } catch (e) {
        advertencias.push({ modelo: 'archivo', filaId: rutaVieja, mensaje: (e as Error).message });
      }
    }
    if (mapaRutas.size > 0) {
      await this.parchearReferenciasDeArchivo(idMap, mapaRutas, advertencias);
    }

    this.logger.log(`Restauración de backup como nuevo encargo '${nuevoAudit.id}': ${totalFilasCreadas} filas, ${totalArchivosSubidos}/${archivos.size} archivos, ${advertencias.length} advertencia(s)`);

    return { audit: nuevoAudit, totalFilasCreadas, totalArchivosSubidos, advertencias };
  }

  /**
   * Construye los datos de creación de UNA fila: quita `id` (Prisma genera uno
   * nuevo), y remapea cada FK real (derivada del schema, no de una lista a
   * mano) según a qué apunte: `User`/`AuditEntity`/`AuditTemplate` → se
   * conserva si existe en la organización actual, si no se deja `null` con
   * advertencia; `Organization` → siempre la organización actual; cualquier
   * otro modelo → se busca en `idMap` (algo ya restaurado de este backup) —
   * si no aparece y el campo es requerido, la fila completa se omite
   * (referencia colgante irreparable); si es opcional, se deja en `null`.
   */
  private remapearFila(
    modelo: string,
    fila: Record<string, unknown>,
    idMap: Map<string, string>,
    conjuntosPorModelo: Record<string, Set<string>>,
    user: AuthUser,
    advertencias: AuditBackupAdvertencia[],
  ): Record<string, unknown> | null {
    const resultado: Record<string, unknown> = { ...fila };
    delete resultado.id;

    for (const fk of obtenerFksDeModelo(modelo)) {
      if (!(fk.campo in resultado)) continue;
      const valorViejo = resultado[fk.campo];
      if (valorViejo === null || valorViejo === undefined) continue;

      if (fk.modeloDestino === 'Organization') {
        resultado[fk.campo] = user.organizationId;
        continue;
      }
      if (conjuntosPorModelo[fk.modeloDestino]) {
        const existe = conjuntosPorModelo[fk.modeloDestino].has(valorViejo as string);
        resultado[fk.campo] = existe ? valorViejo : null;
        if (!existe) {
          advertencias.push({ modelo, filaId: fila.id as string, mensaje: `'${fk.campo}' (${fk.modeloDestino} original: ${valorViejo}) ya no existe en esta organización — se dejó vacío` });
        }
        continue;
      }
      // FK interna del propio backup (Audit, WorkingPaper, Finding, etc.)
      if (idMap.has(valorViejo as string)) {
        resultado[fk.campo] = idMap.get(valorViejo as string);
      } else if (fk.requerido) {
        advertencias.push({ modelo, filaId: fila.id as string, mensaje: `Referencia requerida '${fk.campo}' fuera del alcance del backup — fila omitida` });
        return null;
      } else {
        resultado[fk.campo] = null;
        advertencias.push({ modelo, filaId: fila.id as string, mensaje: `Referencia opcional '${fk.campo}' fuera del alcance del backup — se dejó vacía` });
      }
    }
    return resultado;
  }

  /** Padres antes que hijos — necesario para `AuditFolder.parentId` (autorreferencia). */
  private ordenarPorJerarquia(filas: Record<string, unknown>[]): Record<string, unknown>[] {
    const porId = new Map(filas.map(f => [f.id as string, f]));
    const ordenadas: Record<string, unknown>[] = [];
    const colocadas = new Set<string>();
    let progreso = true;
    let restantes = [...filas];
    while (restantes.length > 0 && progreso) {
      progreso = false;
      const siguienteRonda: Record<string, unknown>[] = [];
      for (const fila of restantes) {
        const parentId = fila.parentId as string | null;
        if (!parentId || !porId.has(parentId) || colocadas.has(parentId)) {
          ordenadas.push(fila);
          colocadas.add(fila.id as string);
          progreso = true;
        } else {
          siguienteRonda.push(fila);
        }
      }
      restantes = siguienteRonda;
    }
    // Ciclo imposible en la práctica (el propio schema no lo permitiría), pero
    // por si un backup viejo/corrupto lo tuviera, se agregan igual al final
    // en vez de perderlas — quedarán con parentId en null (advertencia normal).
    return [...ordenadas, ...restantes];
  }

  /** Reemplaza el paperId (u otro ID interno) viejo de una ruta de Storage por el nuevo. */
  private recalcularRuta(rutaVieja: string, idMap: Map<string, string>, nuevoAuditId: string): string {
    let ruta = rutaVieja;
    for (const [viejo, nuevo] of idMap) {
      if (ruta.includes(viejo)) { ruta = ruta.split(viejo).join(nuevo); return ruta; }
    }
    // No se reconoció ningún ID conocido en la ruta (patrón no anticipado) —
    // se prefija con el audit nuevo para que no colisione con el archivo
    // original, que sigue existiendo en Storage bajo su ruta de siempre.
    return `restored/${nuevoAuditId}/${rutaVieja}`;
  }

  /**
   * Recorre las secciones/documentos recién creados y reemplaza cualquier
   * URL/ruta del backup original por la nueva — sin esto, el encargo
   * restaurado tendría adjuntos "fantasma" apuntando a archivos que ya no
   * están en esa ruta (se subieron con una ruta nueva en el paso anterior).
   */
  private async parchearReferenciasDeArchivo(
    idMap: Map<string, string>, mapaRutas: Map<string, string>, advertencias: AuditBackupAdvertencia[],
  ): Promise<void> {
    // idMap trae IDs nuevos de TODOS los modelos restaurados, no solo de
    // WorkingPaper — inofensivo como filtro (paperId solo puede calzar con
    // los que sí son papeles), solo un poco más amplio de lo estrictamente necesario.
    const idsCandidatos = Array.from(idMap.values());
    const secciones = await this.prisma.paperSection.findMany({
      where: { paperId: { in: idsCandidatos } },
    });

    for (const seccion of secciones) {
      let cambiada = false;
      const attachmentsStr = seccion.attachments ? JSON.stringify(seccion.attachments) : null;
      const valueStr = seccion.value ? JSON.stringify(seccion.value) : null;
      const nuevoAttachments = attachmentsStr ? this.reemplazarRutas(attachmentsStr, mapaRutas) : null;
      const nuevoValue = valueStr ? this.reemplazarRutas(valueStr, mapaRutas) : null;
      if (nuevoAttachments && nuevoAttachments !== attachmentsStr) cambiada = true;
      if (nuevoValue && nuevoValue !== valueStr) cambiada = true;

      if (cambiada) {
        try {
          await this.prisma.paperSection.update({
            where: { id: seccion.id },
            data: {
              ...(nuevoAttachments ? { attachments: JSON.parse(nuevoAttachments) } : {}),
              ...(nuevoValue ? { value: JSON.parse(nuevoValue) } : {}),
            },
          });
        } catch (e) {
          advertencias.push({ modelo: 'paperSection', filaId: seccion.id, mensaje: `No se pudieron actualizar las rutas de archivo: ${(e as Error).message}` });
        }
      }
    }
  }

  /**
   * La ruta relativa (`sections/{paperId}/...`) es siempre una subcadena de
   * la URL pública completa (`.../public/audit-files/sections/{paperId}/...`)
   * — un solo reemplazo de subcadena cubre ambas formas (ruta bare y URL
   * completa) a la vez, sin tener que reconstruir la URL pública aparte.
   */
  private reemplazarRutas(json: string, mapaRutas: Map<string, string>): string {
    let resultado = json;
    for (const [vieja, nueva] of mapaRutas) {
      if (resultado.includes(vieja)) resultado = resultado.split(vieja).join(nueva);
    }
    return resultado;
  }
}

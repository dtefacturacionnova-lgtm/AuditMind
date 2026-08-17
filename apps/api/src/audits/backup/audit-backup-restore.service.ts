import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/jwt.strategy';
import { AuditBackupPackageService } from './audit-backup-package.service';
import { AuditBackupFilesService } from './audit-backup-files.service';
import { verificarBackupManifest } from './audit-backup-manifest';
import {
  AUDIT_SCOPED_MODELS, AuditBackupAdvertencia,
  construirWhereParaModelo, nuevasFamiliasDeIds, MODELOS_QUE_ALIMENTAN_FAMILIA,
} from './audit-backup.types';
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
    const totalFilasCreadas = 1 + await this.crearFilasDesdeBackup(data, idMap, conjuntosPorModelo, user, advertencias);

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
   * Crea el resto del árbol (nivel 1 → 5), reutilizado tanto por "restaurar
   * como nuevo" como por el modo destructivo (BKP-12) — la única diferencia
   * entre ambos modos es CÓMO llega sembrado `idMap` (con un `Audit` recién
   * creado, o con el `auditId` existente ya mapeado a sí mismo) y qué se hizo
   * ANTES de llamar a esto (nada, o borrar los datos existentes).
   */
  private async crearFilasDesdeBackup(
    data: Record<string, Record<string, unknown>[]>,
    idMap: Map<string, string>,
    conjuntosPorModelo: Record<string, Set<string>>,
    user: AuthUser,
    advertencias: AuditBackupAdvertencia[],
  ): Promise<number> {
    let totalFilasCreadas = 0;
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
    return totalFilasCreadas;
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

  // ═══════════════════════════════════════════════════════════════════════
  // BKP-12 — Restaurar SOBRE un encargo existente (destructivo).
  //
  // A diferencia de "restaurar como nuevo", esto BORRA el contenido actual
  // del encargo y lo reemplaza por el del backup — pensado para recuperar de
  // un borrado/daño accidental, no para portabilidad. Por eso el manifest SÍ
  // se valida contra el `auditId` destino (a diferencia del modo no
  // destructivo — ver la nota en `audit-backup-manifest.ts`): solo se puede
  // restaurar destructivamente el backup DEL MISMO encargo, nunca el de otro.
  //
  // No corre dentro de una transacción de Prisma: con ~100+ filas a crear
  // secuencialmente, una transacción interactiva larga es una mala idea
  // contra el connection pooling en modo transacción de Supabase (riesgo real
  // de timeout/comportamiento errático, no solo teórico). El trade-off
  // aceptado: si algo falla A MITAD del borrado o la recreación, el encargo
  // puede quedar en un estado incompleto — se documenta en `advertencias` en
  // vez de fallar en silencio, mismo criterio de tolerancia a fallos por fila
  // ya establecido en el resto de este archivo.
  // ═══════════════════════════════════════════════════════════════════════

  /** Valida el backup contra el encargo destino y devuelve un resumen para que el usuario confirme viendo qué cambiaría — no toca la base de datos. */
  async previsualizarRestauracionDestructiva(auditId: string, buffer: Buffer, user: AuthUser) {
    const auditActual = await this.prisma.audit.findUnique({
      where: { id: auditId }, select: { id: true, title: true, organizationId: true },
    });
    if (!auditActual) throw new NotFoundException('Auditoría no encontrada');
    if (auditActual.organizationId !== user.organizationId) throw new ForbiddenException();

    const { manifestCrudo, dataJson } = await this.packageSvc.desempaquetar(buffer);
    const hashReal = crypto.createHash('sha256').update(dataJson).digest('hex');
    const verif = verificarBackupManifest(this.manifestSecret, manifestCrudo, { auditId, organizationId: user.organizationId }, hashReal);
    if (!verif.ok) throw new BadRequestException(`No se pudo validar el backup: ${verif.razon}`);
    if (verif.manifest.auditId !== auditId) {
      throw new BadRequestException('Este backup pertenece a otro encargo — el modo destructivo solo restaura un backup SOBRE EL MISMO encargo del que se generó');
    }

    const idsPorModelo = await this.recolectarIdsExistentes(auditId);
    const conteoActual: Record<string, number> = { audit: 1 };
    for (const [modelo, ids] of Object.entries(idsPorModelo)) conteoActual[modelo] = ids.length;

    return {
      auditTituloActual: auditActual.title,
      backup: {
        auditTitulo: verif.manifest.auditTitulo,
        generadoEn: verif.manifest.generadoEn,
        generadoPor: verif.manifest.generadoPor,
        conteoPorModelo: verif.manifest.conteoPorModelo,
      },
      conteoActual,
    };
  }

  /** Ejecuta la restauración destructiva. `confirmarTitulo` debe calzar EXACTO con el título actual del encargo — confirmación escrita, no solo un clic. */
  async restaurarDestructivo(auditId: string, buffer: Buffer, user: AuthUser, confirmarTitulo: string) {
    const auditActual = await this.prisma.audit.findUnique({ where: { id: auditId } });
    if (!auditActual) throw new NotFoundException('Auditoría no encontrada');
    if (auditActual.organizationId !== user.organizationId) throw new ForbiddenException();
    if (confirmarTitulo?.trim() !== auditActual.title) {
      throw new BadRequestException('El título escrito no coincide exactamente con el título del encargo — no se restauró nada');
    }

    const { manifestCrudo, dataJson, archivos } = await this.packageSvc.desempaquetar(buffer);
    const hashReal = crypto.createHash('sha256').update(dataJson).digest('hex');
    const verif = verificarBackupManifest(this.manifestSecret, manifestCrudo, { auditId, organizationId: user.organizationId }, hashReal);
    if (!verif.ok) throw new BadRequestException(`No se pudo validar el backup: ${verif.razon}`);
    if (verif.manifest.auditId !== auditId) {
      throw new BadRequestException('Este backup pertenece a otro encargo — el modo destructivo solo restaura un backup SOBRE EL MISMO encargo del que se generó');
    }

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
    idMap.set(auditOriginal.id as string, auditId); // el Audit se conserva — mismo id, no uno nuevo

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

    // ── 1. Borrar TODO lo existente del encargo (el Audit mismo se conserva, solo se actualiza) ──
    await this.eliminarDatosExistentes(auditId, advertencias);

    // ── 2. Actualizar los campos propios del Audit desde el backup ──
    const auditUpdateData = this.remapearFila('audit', auditOriginal, idMap, conjuntosPorModelo, user, advertencias);
    if (!auditUpdateData) throw new BadRequestException('No se pudo reconstruir el registro del encargo desde el backup — la restauración se detuvo después de borrar los datos existentes; revisa advertencias e intenta de nuevo');
    delete auditUpdateData.planId;     // fuera de alcance — no se toca el plan anual ya vinculado
    delete auditUpdateData.createdAt;  // preservar la fecha de creación real del encargo
    delete auditUpdateData.updatedAt;  // que Prisma la recalcule (@updatedAt), no la del backup
    await this.prisma.audit.update({ where: { id: auditId }, data: auditUpdateData as never });

    // ── 3. Resto del árbol, mismo orden de dependencia que "restaurar como nuevo" ──
    const totalFilasCreadas = 1 + await this.crearFilasDesdeBackup(data, idMap, conjuntosPorModelo, user, advertencias);

    // ── 4. Archivos: recalcular ruta, subir, parchear URLs — mismo patrón ──
    const mapaRutas = new Map<string, string>();
    for (const rutaVieja of archivos.keys()) {
      mapaRutas.set(rutaVieja, this.recalcularRuta(rutaVieja, idMap, auditId));
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

    // ── 5. Bitácora — requisito de §4 del diseño: quién, cuándo, desde qué backup ──
    await this.prisma.auditRestoreLog.create({
      data: {
        auditId,
        restoredById: user.id,
        backupGeneradoEn: new Date(verif.manifest.generadoEn),
        backupGeneradoPor: verif.manifest.generadoPor,
        backupAuditTitulo: verif.manifest.auditTitulo,
        totalFilasCreadas,
        totalArchivosSubidos,
        advertencias: advertencias as never,
      },
    });

    const auditFinal = await this.prisma.audit.findUniqueOrThrow({ where: { id: auditId } });
    this.logger.log(`Restauración DESTRUCTIVA del encargo '${auditId}': ${totalFilasCreadas} filas, ${totalArchivosSubidos}/${archivos.size} archivos, ${advertencias.length} advertencia(s)`);

    return { audit: auditFinal, totalFilasCreadas, totalArchivosSubidos, advertencias };
  }

  /** IDs actuales de cada modelo con alcance de encargo — recorre `AUDIT_SCOPED_MODELS` en orden hacia adelante (igual que la exportación) para poder construir las familias de las que dependen los niveles siguientes. */
  private async recolectarIdsExistentes(auditId: string): Promise<Record<string, string[]>> {
    const idsPorModelo: Record<string, string[]> = {};
    const idsPorFamilia = nuevasFamiliasDeIds();
    const familias = new Set<string>(MODELOS_QUE_ALIMENTAN_FAMILIA);

    for (const modelo of AUDIT_SCOPED_MODELS) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const delegate = (this.prisma as any)[modelo.model];
      if (!delegate?.findMany) { idsPorModelo[modelo.model] = []; continue; }

      const where = construirWhereParaModelo(modelo, auditId, idsPorFamilia);
      const filas: { id: string }[] = where === null ? [] : await delegate.findMany({ where, select: { id: true } });
      const ids = filas.map(f => f.id);
      idsPorModelo[modelo.model] = ids;
      if (familias.has(modelo.model)) idsPorFamilia[modelo.model] = ids;
    }
    return idsPorModelo;
  }

  /**
   * Borra TODAS las filas con alcance de este encargo (todo `AUDIT_SCOPED_MODELS`,
   * el `Audit` mismo NO se toca aquí). Orden INVERSO al de creación — hijos
   * antes que padres — para no depender de que cada FK tenga `onDelete:
   * Cascade` configurado (aunque casi todas lo tienen, por diseño explícito
   * no se asume). Un fallo aquí es FATAL a propósito: seguir adelante y crear
   * filas nuevas sobre datos viejos no borrados dejaría al encargo con
   * datos duplicados/mezclados de forma silenciosa — preferible abortar
   * ruidosamente y que el usuario reintente o pida ayuda.
   */
  private async eliminarDatosExistentes(auditId: string, advertencias: AuditBackupAdvertencia[]): Promise<void> {
    const idsPorModelo = await this.recolectarIdsExistentes(auditId);
    for (const modelo of [...AUDIT_SCOPED_MODELS].reverse()) {
      const ids = idsPorModelo[modelo.model] ?? [];
      if (ids.length === 0) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const delegate = (this.prisma as any)[modelo.model];
      try {
        await delegate.deleteMany({ where: { id: { in: ids } } });
      } catch (e) {
        advertencias.push({ modelo: modelo.model, mensaje: `No se pudieron borrar los datos existentes antes de restaurar: ${(e as Error).message}` });
        throw new BadRequestException(`La restauración se detuvo al borrar los datos existentes de '${modelo.model}' — el encargo puede haber quedado con datos incompletos. Revisa el encargo antes de reintentar.`);
      }
    }
  }
}

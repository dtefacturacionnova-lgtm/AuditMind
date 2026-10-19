import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfirmationStatus } from '@prisma/client';
import { AuthUser } from '../auth/jwt.strategy';
import { AuditInvestigationAccessService } from '../investigation-report/audit-investigation-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { SignatureAttachmentsService } from '../signatures/signature-attachments.service';
import { SignatureStorageService } from '../signatures/signature-storage.service';
import { authorizationFolder } from './confirmation-signature.payload';

/**
 * Carta de autorización del cliente para una confirmación externa (docs/firma-externa-por-enlace.md §11.2): el auditor la
 * sube ANTES de enviar y se une al PDF que verá el confirmante (los bancos suelen exigirla). Pasa por la misma cadena de
 * defensa que los adjuntos del tercero: tipo por bytes, antivirus que falla cerrado y reconstrucción del PDF.
 *
 * Vive bajo `signature-requests/<auditId>/authorizations/<confirmationId>/`: así la borra el borrado del encargo.
 * Solo hay UNA carta por confirmación: subir otra reemplaza la anterior.
 */
@Injectable()
export class ConfirmationAuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attachments: SignatureAttachmentsService,
    private readonly storage: SignatureStorageService,
    private readonly access: AuditInvestigationAccessService,
  ) {}

  /** La confirmación debe ser de la organización, accesible para este usuario (modo investigación) y estar en borrador. */
  private async loadDraft(id: string, user: AuthUser) {
    const conf = await this.prisma.externalConfirmation.findFirst({
      where: { id, audit: { organizationId: user.organizationId } },
      select: { id: true, auditId: true, status: true },
    });
    if (!conf) throw new NotFoundException('Confirmación no encontrada');
    await this.access.assertAccess(conf.auditId, user);
    if (conf.status !== ConfirmationStatus.DRAFT) {
      throw new ForbiddenException('Solo se puede cambiar la carta de autorización de una confirmación en borrador.');
    }
    return conf;
  }

  async upload(id: string, file: { originalname: string; buffer: Buffer } | undefined, user: AuthUser) {
    const conf = await this.loadDraft(id, user);
    if (!file?.buffer) throw new BadRequestException('Adjunta el archivo de la carta de autorización.');

    const folder = authorizationFolder(conf.auditId, conf.id);
    const previous = await this.storage.listAll(folder);
    const accepted = await this.attachments.acceptStandalone(file, folder);
    if (previous.length > 0) await this.storage.remove(previous); // la nueva ya está guardada: recién entonces se quita la anterior
    return { authorizationPath: accepted.safePath, name: accepted.name, sizeBytes: accepted.sizeBytes };
  }

  async remove(id: string, user: AuthUser) {
    const conf = await this.loadDraft(id, user);
    const files = await this.storage.listAll(authorizationFolder(conf.auditId, conf.id));
    if (files.length > 0) await this.storage.remove(files);
    return { removed: true };
  }
}

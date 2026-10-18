import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { decryptSecret, encryptSecret } from '../common/utils/signing-key.util';
import { certFingerprintSha256, generateSelfSignedCert } from '../common/utils/self-signed-cert.util';

export interface OrganizationSeal {
  certPem: string;
  privateKeyPem: string;
  fingerprintSha256: string;
  organizationName: string;
}

/**
 * Sello de evidencia POR ORGANIZACIÓN (docs/firma-externa-por-enlace.md §10).
 *
 * El PDF final de una firma por enlace se sella con este certificado: la organización
 * certifica "esto registró mi sistema", sin hacerse pasar por el firmante externo ni por
 * un auditor concreto. Es un sello de integridad (certificado autofirmado), no una firma
 * electrónica certificada; ver §20 del documento para el camino a esta última.
 *
 * Se genera en el primer uso y la clave privada se guarda cifrada (AES-256-GCM con
 * ENCRYPTION_KEY), igual que `SigningIdentityService` hace con los usuarios.
 */
@Injectable()
export class OrganizationSealService {
  private readonly logger = new Logger(OrganizationSealService.name);
  private readonly encryptionKey: string;

  constructor(private readonly prisma: PrismaService, config: ConfigService) {
    this.encryptionKey = config.get<string>('ENCRYPTION_KEY', '');
  }

  async getOrCreateSeal(organizationId: string): Promise<OrganizationSeal> {
    if (!this.encryptionKey) {
      throw new ServiceUnavailableException('El sello de evidencia no está disponible: falta la clave de cifrado del servidor.');
    }
    const select = { name: true, sealCertPem: true, sealKeyEncrypted: true } as const;
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select });
    if (org.sealCertPem && org.sealKeyEncrypted) return this.toSeal(org.name, org.sealCertPem, org.sealKeyEncrypted);

    const generated = generateSelfSignedCert({
      commonName: `Sello de evidencia - ${org.name}`.slice(0, 64),
      organizationName: org.name.slice(0, 64),
      validityYears: 10,
      evidenceSeal: true,
    });
    const keyEncrypted = encryptSecret(generated.privateKeyPem, this.encryptionKey);

    // Si dos peticiones generan a la vez, solo gana la primera en escribir; la otra lee el ganador.
    const written = await this.prisma.organization.updateMany({
      where: { id: organizationId, sealCertPem: null },
      data: { sealCertPem: generated.certPem, sealKeyEncrypted: keyEncrypted, sealCreatedAt: new Date() },
    });
    if (written.count === 1) {
      this.logger.log(`Sello de evidencia generado para la organización ${organizationId}`);
      return this.toSeal(org.name, generated.certPem, keyEncrypted);
    }
    const winner = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select });
    return this.toSeal(winner.name, winner.sealCertPem!, winner.sealKeyEncrypted!);
  }

  /** Huella del sello si ya existe (no lo crea). Para mostrarla en "Mi organización" y en /verificar. */
  async getFingerprintIfExists(organizationId: string): Promise<string | null> {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { sealCertPem: true } });
    return org?.sealCertPem ? certFingerprintSha256(org.sealCertPem) : null;
  }

  private toSeal(name: string, certPem: string, keyEncrypted: string): OrganizationSeal {
    return {
      certPem,
      privateKeyPem: decryptSecret(keyEncrypted, this.encryptionKey),
      fingerprintSha256: certFingerprintSha256(certPem),
      organizationName: name,
    };
  }
}

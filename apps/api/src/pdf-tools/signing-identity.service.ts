import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as forge from 'node-forge';
import { PrismaService } from '../prisma/prisma.service';
import { encryptSecret, decryptSecret } from '../common/utils/signing-key.util';

export interface SigningIdentity {
  certPem: string;
  privateKeyPem: string;
}

// ─── Custodia de certificados de firma (2026-08-24) ─────────────────────────
// Sello de integridad INTERNO — no es una firma electrónica con validez legal
// externa (eso requeriría un certificado emitido por un Prestador de
// Servicios de Certificación acreditado ante la Unidad de Firma Electrónica
// del Ministerio de Economía; ver memoria de sesión "project_pdf_tools_stirling"
// para el camino a futuro). AuditMind emite un certificado autofirmado por
// usuario la primera vez que lo necesita — prueba que ESE usuario aprobó ESA
// versión exacta de un documento, no más que eso.
@Injectable()
export class SigningIdentityService {
  private readonly logger = new Logger(SigningIdentityService.name);
  private readonly encryptionKey: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.encryptionKey = this.config.get<string>('ENCRYPTION_KEY', '');
    if (!this.encryptionKey) {
      this.logger.warn('ENCRYPTION_KEY no configurada — la firma digital fallará al intentar usarse');
    }
  }

  /** Devuelve el certificado/clave del usuario, generándolos en el primer uso. */
  async getOrCreateIdentity(userId: string): Promise<SigningIdentity> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, email: true, signingCertPem: true, signingKeyEncrypted: true },
    });

    if (user.signingCertPem && user.signingKeyEncrypted) {
      return {
        certPem: user.signingCertPem,
        privateKeyPem: decryptSecret(user.signingKeyEncrypted, this.encryptionKey),
      };
    }

    const identity = this.generateSelfSignedIdentity(user.name, user.email);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        signingCertPem: identity.certPem,
        signingKeyEncrypted: encryptSecret(identity.privateKeyPem, this.encryptionKey),
      },
    });
    this.logger.log(`Certificado de firma generado para usuario ${userId}`);
    return identity;
  }

  /** Genera un certificado X.509 autofirmado (RSA 2048, válido 5 años). La
   * clave privada sale en formato PKCS#1 tradicional — node-forge lo produce
   * así por defecto, que es justo lo que Stirling-PDF requiere (PKCS#8 falla
   * con ClassCastException, verificado en vivo). */
  private generateSelfSignedIdentity(name: string, email: string): SigningIdentity {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();

    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01' + forge.util.bytesToHex(forge.random.getBytesSync(8));
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 5);

    const attrs = [
      { name: 'commonName', value: name },
      { name: 'emailAddress', value: email },
      { name: 'organizationName', value: 'AuditMind' },
      { name: 'countryName', value: 'SV' },
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs); // autofirmado: emisor = sujeto
    cert.sign(keys.privateKey, forge.md.sha256.create());

    return {
      certPem: forge.pki.certificateToPem(cert),
      privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
    };
  }
}

import * as forge from 'node-forge';

/**
 * Certificado X.509 autofirmado (RSA-2048). La clave privada sale en PKCS#1 tradicional
 * (`-----BEGIN RSA PRIVATE KEY-----`), que es lo que exige Stirling-PDF en cert-sign
 * (PKCS#8 lanza ClassCastException — verificado en vivo, ver project_pdf_tools_stirling).
 */
export interface SelfSignedCert {
  certPem: string;
  privateKeyPem: string;
}

export interface SelfSignedCertOptions {
  commonName: string;
  organizationName: string;
  emailAddress?: string;
  validityYears: number;
  /** keyUsage digitalSignature + nonRepudiation (sello de evidencia). */
  evidenceSeal?: boolean;
}

export function generateSelfSignedCert(opts: SelfSignedCertOptions): SelfSignedCert {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01' + forge.util.bytesToHex(forge.random.getBytesSync(8));
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + opts.validityYears);

  const attrs: forge.pki.CertificateField[] = [
    { name: 'commonName', value: opts.commonName },
    { name: 'organizationName', value: opts.organizationName },
    { name: 'countryName', value: 'SV' },
  ];
  if (opts.emailAddress) attrs.push({ name: 'emailAddress', value: opts.emailAddress });
  cert.setSubject(attrs);
  cert.setIssuer(attrs); // autofirmado: emisor = sujeto

  if (opts.evidenceSeal) {
    cert.setExtensions([
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, nonRepudiation: true },
    ]);
  }

  cert.sign(keys.privateKey, forge.md.sha256.create());
  return {
    certPem: forge.pki.certificateToPem(cert),
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };
}

/** Huella SHA-256 del certificado (DER) en hex mayúsculas con ':' — la que se muestra al usuario. */
export function certFingerprintSha256(certPem: string): string {
  const cert = forge.pki.certificateFromPem(certPem);
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const hex = forge.md.sha256.create().update(der).digest().toHex().toUpperCase();
  return hex.match(/.{2}/g)!.join(':');
}

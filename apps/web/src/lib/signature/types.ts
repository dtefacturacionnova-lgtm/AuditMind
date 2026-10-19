/**
 * Tipos de las respuestas PÚBLICAS de la firma por enlace (docs/firma-externa-por-enlace.md §9.1).
 * Reflejan exactamente lo que devuelve apps/api/src/signatures/signature-views.ts.
 */

export type FormFieldType = 'text' | 'textarea' | 'boolean' | 'amount';

export interface FormField {
  key: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  /** Obligatorio solo cuando otro campo (sí/no) tiene ese valor: el saldo si NO está de acuerdo, por ejemplo. */
  requiredIf?: { field: string; equals: boolean };
  maxLength?: number;
  help?: string;
}

export interface FormSpec {
  fields: FormField[];
  allowAttachments: boolean;
  signedRoleRequired: boolean;
}

export interface PublicRequest {
  orgName: string;
  documentLabel: string;
  title: string;
  maskedEmail: string;
  expiresAt: string | null;
  status: 'PENDING' | 'SIGNED' | 'DECLINED';
  requiresOtp: true;
  signedAt: string | null;
  canDownloadSigned: boolean;
}

export interface PublicAttachment {
  id: string;
  originalName: string;
  sizeBytes: number;
}

export interface PublicDocument {
  title: string;
  documentLabel: string;
  orgName: string;
  signerName: string;
  signerRole: string | null;
  expiresAt: string | null;
  documentSha256: string;
  pdfUrl: string;
  consentVersion: string;
  consentText: string;
  privacyNotice: string;
  declineNotice: string;
  form: FormSpec;
  attachments: PublicAttachment[];
}

export interface OtpSent { sent: true; maskedEmail: string; resendInSeconds: number }
export interface OtpVerified { sessionToken: string; sessionExpiresAt: string }
export interface SignResult { status: 'SIGNED'; verificationCode: string; sealing: true }
export interface SignedDownload { sealing: boolean; failed: boolean; pdfUrl?: string }

export interface VerifyResult {
  valid: boolean;
  sealing: boolean;
  documentLabel: string;
  title: string;
  orgName: string;
  signedAt: string | null;
  signedName: string | null;
  sealedAt: string | null;
  acceptedHashes: string[];
  sealFingerprint: string | null;
  timestamped: boolean;
}

export interface SignPayload {
  signedName: string;
  signedRole?: string;
  consent: true;
  response: Record<string, unknown>;
}

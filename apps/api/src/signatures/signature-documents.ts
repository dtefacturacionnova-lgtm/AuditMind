import { Injectable, Logger } from '@nestjs/common';
import { Prisma, SignatureDocumentType, SignatureRequest } from '@prisma/client';
import { AuthUser } from '../auth/jwt.strategy';

/**
 * Contrato que cumple cada tipo de documento firmable (carta, confirmación, acta).
 * El núcleo (SignatureRequestsService / SignaturePublicService) es genérico; cada documento
 * aporta: validación de su origen, su PDF, el formulario del firmante y su efecto al firmar.
 * Los adaptadores reales llegan en F2 (carta), F3 (confirmación) y F4 (acta) y se registran en
 * `SignatureAdapterRegistry` desde su propio módulo (onModuleInit) — así no hay dependencias circulares.
 */

export type FormFieldType = 'text' | 'textarea' | 'boolean' | 'amount';

export interface FormField {
  key: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  maxLength?: number;
  help?: string;
}

export interface FormSpec {
  fields: FormField[];
  /** ¿El firmante puede adjuntar archivos? (solo confirmaciones) */
  allowAttachments: boolean;
  /** ¿El cargo es obligatorio? (carta y confirmación) */
  signedRoleRequired: boolean;
}

export interface PrepareContext {
  user: AuthUser;
  targetId: string;
  signer: { name: string; email: string; role?: string | null };
  /** Datos propios del tipo que mandó el auditor (se validan en el adaptador; nunca confiar en su forma). */
  payload: Record<string, unknown>;
}

export interface PreparedDocument {
  /** Encargo al que pertenece (null en la carta, que vive a nivel de cliente). */
  auditId: string | null;
  title: string;
  subtitle?: string;
  /** HTML del cuerpo del PDF, YA escapado por el adaptador. */
  bodyHtml: string;
  /** Payload normalizado que se guarda en la solicitud (inmutable una vez enviada). */
  payload: Record<string, unknown>;
}

export interface SignedContext {
  request: SignatureRequest;
  signedName: string;
  signedRole: string | null;
  response: Record<string, unknown>;
  at: Date;
}

export interface SignatureDocumentAdapter {
  readonly type: SignatureDocumentType;
  /** Rol mínimo para enviar este tipo de documento (p. ej. AUDIT_MANAGER para la carta). */
  readonly minRole: string;
  /** "Carta de compromiso", "Confirmación externa (NIA 505)", "Acta de entrevista" */
  readonly label: string;
  readonly defaultExpiryDays: number;
  readonly allowsAttachments: boolean;

  /** Valida el origen (existe, es de la organización, estado permitido, modo investigación…) y arma el documento. */
  prepare(ctx: PrepareContext): Promise<PreparedDocument>;
  /** Valida y normaliza la respuesta del firmante; lanza BadRequestException si es inválida. */
  validateResponse(payload: Record<string, unknown>, response: unknown): Record<string, unknown>;
  /** Campos del formulario que ve el firmante. */
  buildForm(payload: Record<string, unknown>): FormSpec;
  /** Líneas "etiqueta → valor" de la respuesta para la hoja de evidencia (texto plano; se escapa al renderizar). */
  summarizeResponse(payload: Record<string, unknown>, response: Record<string, unknown>): Array<[string, string]>;

  // Efectos sobre el documento de origen. Todos reciben la transacción en curso.
  onCreated?(tx: Prisma.TransactionClient, request: SignatureRequest): Promise<void>;
  onSigned?(tx: Prisma.TransactionClient, ctx: SignedContext): Promise<void>;
  onDeclined?(tx: Prisma.TransactionClient, request: SignatureRequest, reason: string): Promise<void>;
  onRevoked?(tx: Prisma.TransactionClient, request: SignatureRequest, reason: string): Promise<void>;
  /** Tras sellar (fuera de transacción): p. ej. adjuntar el PDF firmado al papel de trabajo. */
  afterSealed?(request: SignatureRequest, signedPdfPath: string, signedPdf: Buffer): Promise<void>;
}

@Injectable()
export class SignatureAdapterRegistry {
  private readonly logger = new Logger(SignatureAdapterRegistry.name);
  private readonly adapters = new Map<SignatureDocumentType, SignatureDocumentAdapter>();

  register(adapter: SignatureDocumentAdapter): void {
    if (this.adapters.has(adapter.type)) this.logger.warn(`Adaptador de firma ${adapter.type} registrado dos veces; se reemplaza`);
    this.adapters.set(adapter.type, adapter);
  }

  /** undefined si el tipo aún no tiene adaptador (fases F2–F4 pendientes). */
  find(type: SignatureDocumentType): SignatureDocumentAdapter | undefined {
    return this.adapters.get(type);
  }
}

import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly aiServiceUrl: string;
  private readonly internalKey: string;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    this.aiServiceUrl = this.config.get<string>('AI_SERVICE_URL', 'http://localhost:3003');
    this.internalKey  = this.config.get<string>('AI_SERVICE_INTERNAL_KEY', 'auditmind-internal-2026-xK9mP3qR');
  }

  // ─── Chat con agente ─────────────────────────────────────────────────────────
  async chat(
    agentType: string,
    message: string,
    history: { role: string; content: string }[],
    context: Record<string, unknown> = {},
    authorization: string,
  ): Promise<{ response: string; model: string }> {
    // Build messages array for the AI service
    const messages = [
      ...history,
      { role: 'user', content: message },
    ];

    const body = {
      agent_type: agentType.toUpperCase(),
      messages,
      context: Object.keys(context).length > 0 ? context : undefined,
    };

    try {
      const res = await fetch(`${this.aiServiceUrl}/agents/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': this.internalKey,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorText = await res.text();
        this.logger.error(`AI service error ${res.status}: ${errorText}`);
        throw new HttpException(
          `AI service error: ${res.status}`,
          HttpStatus.BAD_GATEWAY,
        );
      }

      const data = await res.json() as {
        content: string;
        model: string;
        input_tokens: number;
        output_tokens: number;
        agent_type: string;
      };

      return {
        response: data.content,
        model: data.model,
      };
    } catch (err: unknown) {
      if (err instanceof HttpException) throw err;
      this.logger.error('Failed to reach AI service', err);
      throw new HttpException(
        'El servicio de IA no está disponible. Asegúrate de que el AI Service está corriendo en puerto 3003.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  // ─── Lista de agentes ─────────────────────────────────────────────────────────
  async listAgents(): Promise<{ agents: unknown[]; total: number }> {
    try {
      const res = await fetch(`${this.aiServiceUrl}/agents/list`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      return res.json();
    } catch {
      // Return static list if AI service is down
      return {
        agents: [
          { id: 'MINERVA',      name: 'Minerva',      specialty: 'Planificación y Riesgos' },
          { id: 'SCRIPTORIUM',  name: 'Scriptorium',  specialty: 'Documentación' },
          { id: 'ARGUS',        name: 'Argus',         specialty: 'Controles Internos' },
          { id: 'HERMES',       name: 'Hermes',        specialty: 'Análisis Forense' },
          { id: 'CICERO',       name: 'Cicero',        specialty: 'Reportería' },
          { id: 'SOCRATES',     name: 'Sócrates',      specialty: 'Entrevistas' },
          { id: 'CASSANDRA',    name: 'Cassandra',     specialty: 'Predicción de Riesgos' },
          { id: 'VULCANO',      name: 'Vulcano',       specialty: 'Auditoría de TI' },
          { id: 'SENADO',       name: 'Senado',        specialty: 'Compliance' },
          { id: 'ATLAS',        name: 'Atlas',         specialty: 'ESG' },
          { id: 'FENIX',        name: 'Fénix',         specialty: 'BCP/DRP' },
          { id: 'LEX',          name: 'Lex',           specialty: 'Legal' },
          { id: 'SHERLOCK',     name: 'Sherlock',      specialty: 'Investigación Forense' },
          { id: 'MINERVA_QAIP', name: 'Minerva-QAIP',  specialty: 'QAIP y Calidad' },
        ],
        total: 14,
      };
    }
  }

  // ─── Scriptorium — Mejorar hallazgo ──────────────────────────────────────────
  async improveFinding(finding: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(`${this.aiServiceUrl}/scriptorium/improve-finding`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': this.internalKey,
      },
      body: JSON.stringify({ finding }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new HttpException(`Scriptorium error: ${err}`, HttpStatus.BAD_GATEWAY);
    }
    return res.json();
  }

  // ─── Scriptorium — Generar hallazgo desde descripción ────────────────────────
  async generateFinding(
    description: string,
    auditTitle?: string,
    auditType?: string,
    severity?: string,
  ): Promise<unknown> {
    const res = await fetch(`${this.aiServiceUrl}/scriptorium/generate-finding`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': this.internalKey,
      },
      body: JSON.stringify({ description, auditTitle, auditType, severity }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new HttpException(`Scriptorium error: ${err}`, HttpStatus.BAD_GATEWAY);
    }
    return res.json();
  }

  // ─── Scriptorium — Generar programa de auditoría ──────────────────────────────
  async generateAuditProgram(payload: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(`${this.aiServiceUrl}/scriptorium/audit-program`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': this.internalKey,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new HttpException(`Scriptorium error: ${err}`, HttpStatus.BAD_GATEWAY);
    }
    return res.json();
  }

  // ─── Scriptorium — Generar borrador de papel de trabajo ──────────────────────
  async generateWorkingPaper(payload: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(`${this.aiServiceUrl}/scriptorium/working-paper`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': this.internalKey,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new HttpException(`Scriptorium error: ${err}`, HttpStatus.BAD_GATEWAY);
    }
    return res.json();
  }

  // ─── RAG — Subir PDF normativo ──────────────────────────────────────────────
  async ingestPdf(
    fileBuffer: Buffer,
    filename: string,
    docTitle: string,
    ragBase: string,
    orgId?: string,
  ): Promise<unknown> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(fileBuffer)], { type: 'application/pdf' });
    formData.append('file', blob, filename);
    formData.append('doc_title', docTitle);
    formData.append('rag_base', ragBase);
    if (orgId) formData.append('org_id', orgId);

    const res = await fetch(`${this.aiServiceUrl}/rag/ingest/pdf`, {
      method: 'POST',
      headers: { 'x-internal-key': this.internalKey },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new HttpException(`RAG ingest error: ${err}`, HttpStatus.BAD_GATEWAY);
    }
    return res.json();
  }

  // ─── RAG — Bases disponibles ─────────────────────────────────────────────────
  async listRagBases(): Promise<unknown> {
    const res = await fetch(`${this.aiServiceUrl}/rag/bases`);
    if (!res.ok) throw new HttpException('RAG bases error', HttpStatus.BAD_GATEWAY);
    return res.json();
  }

  // ─── RAG — Listar documentos ─────────────────────────────────────────────────
  async listRagDocuments(orgId?: string, ragBase?: string): Promise<unknown> {
    const params = new URLSearchParams();
    if (orgId) params.set('org_id', orgId);
    if (ragBase) params.set('rag_base', ragBase);
    const qs = params.toString();
    const res = await fetch(`${this.aiServiceUrl}/rag/documents${qs ? `?${qs}` : ''}`);
    if (!res.ok) throw new HttpException('RAG list error', HttpStatus.BAD_GATEWAY);
    return res.json();
  }

  // ─── RAG — Eliminar documento ────────────────────────────────────────────────
  async deleteRagDocument(docId: string): Promise<unknown> {
    const res = await fetch(`${this.aiServiceUrl}/rag/documents/${docId}`, {
      method: 'DELETE',
      headers: { 'x-internal-key': this.internalKey },
    });
    if (!res.ok) {
      const err = await res.text();
      throw new HttpException(`RAG delete error: ${err}`, HttpStatus.BAD_GATEWAY);
    }
    return res.json();
  }

  // ─── Análisis CAATs ───────────────────────────────────────────────────────────
  async runCaats(
    analysisType: 'gl' | 'ap' | 'payroll' | 'benford' | 'anomaly',
    payload: unknown,
  ): Promise<unknown> {
    const res = await fetch(`${this.aiServiceUrl}/analytics/${analysisType}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': this.internalKey,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new HttpException(
        `CAATs analysis failed: ${err}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
    return res.json() as Promise<unknown>;
  }

  // ─── ATLAS — Análisis Multi-Año ───────────────────────────────────────────────
  async multiYearAnalysis(payload: {
    audits: Array<{
      id: string;
      title: string;
      type: string;
      subtype?: string;
      startDate?: string;
      endDate?: string;
      status: string;
      riskLevel?: string;
      entityName?: string;
      scope?: string;
      findings: Array<{
        id: string;
        title: string;
        severity: string;
        status: string;
        condition?: string;
        criteria?: string;
        cause?: string;
        effect?: string;
        risk?: string;
        recommendation?: string;
      }>;
    }>;
    organizationName?: string;
    auditEntityName?: string;
  }): Promise<unknown> {
    const res = await fetch(`${this.aiServiceUrl}/agents/multi-year-analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': this.internalKey,
      },
      body: JSON.stringify({
        audits: payload.audits,
        organization_name: payload.organizationName,
        audit_entity_name: payload.auditEntityName,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`ATLAS multi-year error ${res.status}: ${err}`);
      throw new HttpException(
        `Error en análisis multi-año: ${res.status}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
    return res.json() as Promise<unknown>;
  }
}

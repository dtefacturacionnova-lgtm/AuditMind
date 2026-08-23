import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Headers,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import {
  IsString, IsArray, IsOptional, IsNumber,
  ValidateNested, IsObject, IsNotEmpty, Min, Max, ArrayMinSize, ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { AiService } from './ai.service';
import { PrismaService } from '../prisma/prisma.service';

class MessageDto {
  @IsString() role!: string;
  @IsString() content!: string;
}

class ChatDto {
  @IsString() @IsNotEmpty() agentType!: string;
  @IsString() @IsNotEmpty() message!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => MessageDto)
  history!: MessageDto[];
  @IsOptional() @IsObject() context?: Record<string, unknown>;
}

class CaatsDto {
  @IsOptional() @IsArray() records?: unknown[];
  @IsOptional() @IsArray() amounts?: number[];
  @IsOptional() @IsArray() @IsString({ each: true }) numeric_fields?: string[];
  @IsOptional() @IsObject() field_mapping?: Record<string, string>;
  @IsOptional() @IsNumber() @Min(0.01) @Max(0.5) contamination?: number;
}

class MultiYearAnalysisDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @IsString({ each: true })
  auditIds!: string[];
}

@ApiTags('AI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Chat ──────────────────────────────────────────────────────────────────
  @Post('chat')
  @ApiOperation({ summary: 'Chat con un agente de IA' })
  async chat(
    @Body() dto: ChatDto,
    @Headers('authorization') authorization: string,
  ) {
    return this.aiService.chat(
      dto.agentType,
      dto.message,
      dto.history ?? [],
      dto.context ?? {},
      authorization,
    );
  }

  // ─── Agents list ───────────────────────────────────────────────────────────
  @Get('agents')
  @ApiOperation({ summary: 'Lista de agentes disponibles' })
  async listAgents() {
    return this.aiService.listAgents();
  }

  // ─── CAATs ─────────────────────────────────────────────────────────────────
  @Post('analytics/:type')
  @ApiOperation({ summary: 'Ejecutar análisis CAATs (gl, ap, payroll, benford, anomaly)' })
  async runCaats(
    @Param('type') type: 'gl' | 'ap' | 'payroll' | 'benford' | 'anomaly',
    @Body() payload: CaatsDto,
  ) {
    return this.aiService.runCaats(type, payload);
  }

  @Post('parse-file')
  @ApiOperation({ summary: 'Leer un CSV/Excel subido para CAATs — sin normalizar, columnas tal cual vienen' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async parseFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new Error('No se subió ningún archivo');
    return this.aiService.parseFile(file.buffer, file.originalname);
  }

  // ─── PI.7a — Muestreo estadístico NIA 530 ─────────────────────────────────
  @Post('sampling/calculate/:method')
  @ApiOperation({ summary: 'Calcular tamaño muestra (mus | attribute)' })
  async calculateSampling(
    @Param('method') method: 'mus' | 'attribute',
    @Body() payload: Record<string, unknown>,
  ) {
    return this.aiService.calculateSampling(method, payload);
  }

  @Post('sampling/select')
  @ApiOperation({ summary: 'Seleccionar registros de la muestra (RANDOM | SYSTEMATIC | MUS)' })
  async selectSample(@Body() payload: Record<string, unknown>) {
    return this.aiService.selectSample(payload);
  }

  // ─── Scriptorium — Mejorar hallazgo ──────────────────────────────────────────
  @Post('scriptorium/improve-finding')
  @ApiOperation({ summary: 'Mejorar redacción de un hallazgo con Scriptorium IA' })
  async improveFinding(@Body() body: { finding: Record<string, unknown> }) {
    return this.aiService.improveFinding(body.finding);
  }

  // ─── Scriptorium — Generar hallazgo desde descripción ────────────────────────
  @Post('scriptorium/generate-finding')
  @ApiOperation({ summary: 'Generar hallazgo C-C-C-E-R-R desde descripción breve' })
  async generateFinding(@Body() body: {
    description: string;
    auditTitle?: string;
    auditType?: string;
    severity?: string;
  }) {
    return this.aiService.generateFinding(
      body.description, body.auditTitle, body.auditType, body.severity,
    );
  }

  // ─── Scriptorium — Programa de auditoría ─────────────────────────────────────
  @Post('scriptorium/audit-program')
  @ApiOperation({ summary: 'Generar programa de auditoría con procedimientos NIA' })
  async generateAuditProgram(@Body() body: Record<string, unknown>) {
    return this.aiService.generateAuditProgram(body);
  }

  // ─── Scriptorium — Papel de trabajo ──────────────────────────────────────────
  @Post('scriptorium/working-paper')
  @ApiOperation({ summary: 'Generar borrador de papel de trabajo' })
  async generateWorkingPaper(@Body() body: Record<string, unknown>) {
    return this.aiService.generateWorkingPaper(body);
  }

  // ─── RAG — Subir PDF ─────────────────────────────────────────────────────────
  @Post('rag/ingest/pdf')
  @ApiOperation({ summary: 'Subir PDF normativo al motor RAG (pgvector)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async ingestPdf(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { docTitle: string; ragBase: string; orgId?: string },
  ) {
    if (!file) throw new Error('No file uploaded');
    return this.aiService.ingestPdf(
      file.buffer,
      file.originalname,
      body.docTitle,
      body.ragBase,
      body.orgId,
    );
  }

  // ─── RAG — Bases de conocimiento ─────────────────────────────────────────────
  @Get('rag/bases')
  @ApiOperation({ summary: 'Listar bases de conocimiento RAG disponibles' })
  async listRagBases() {
    return this.aiService.listRagBases();
  }

  // ─── RAG — Listar documentos ─────────────────────────────────────────────────
  @Get('rag/documents')
  @ApiOperation({ summary: 'Listar documentos en la base de conocimiento RAG' })
  async listRagDocuments(
    @Query('orgId') orgId?: string,
    @Query('ragBase') ragBase?: string,
  ) {
    return this.aiService.listRagDocuments(orgId, ragBase);
  }

  // ─── RAG — Eliminar documento ────────────────────────────────────────────────
  @Delete('rag/documents/:docId')
  @ApiOperation({ summary: 'Eliminar documento de la base de conocimiento RAG' })
  async deleteRagDocument(@Param('docId') docId: string) {
    return this.aiService.deleteRagDocument(docId);
  }

  // ─── ATLAS — Análisis Multi-Año ──────────────────────────────────────────────
  @Post('multi-year-analysis')
  @ApiOperation({ summary: 'ATLAS: Análisis de inteligencia histórica multi-año (2-6 auditorías)' })
  async multiYearAnalysis(
    @Body() dto: MultiYearAnalysisDto,
    @CurrentUser() user: AuthUser,
  ) {
    // Fetch all audits with their findings from the DB
    const audits = await this.prisma.audit.findMany({
      where: {
        id: { in: dto.auditIds },
        organizationId: user.organizationId,
      },
      include: {
        auditEntity: { select: { name: true } },
        findings: {
          select: {
            id: true, title: true, severity: true, status: true,
            condition: true, criteria: true, cause: true,
            effect: true, risk: true, recommendation: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    // Security: ensure all requested IDs were found in the org
    if (audits.length !== dto.auditIds.length) {
      throw new ForbiddenException('Algunas auditorías no pertenecen a su organización');
    }

    // Build the structured payload for the AI service
    const auditPayload = audits.map(a => ({
      id: a.id,
      title: a.title,
      type: a.type,
      subtype: (a as any).subtype ?? undefined,
      startDate: a.startDate ? new Date(a.startDate).getFullYear().toString() : undefined,
      endDate:   a.endDate   ? new Date(a.endDate).getFullYear().toString()   : undefined,
      status: a.status,
      riskLevel: (a as any).riskLevel ?? undefined,
      entityName: (a as any).auditEntity?.name ?? (a as any).entityName ?? a.title,
      scope: a.scope ?? undefined,
      findings: ((a as any).findings as any[]).map((f: any) => ({
        id: f.id,
        title: f.title,
        severity: f.severity,
        status: f.status,
        condition:      f.condition      ?? undefined,
        criteria:       f.criteria       ?? undefined,
        cause:          f.cause          ?? undefined,
        effect:         f.effect         ?? undefined,
        risk:           f.risk           ?? undefined,
        recommendation: f.recommendation ?? undefined,
      })),
    }));

    // Infer entity name from first audit (best available)
    const entityName =
      (audits[0] as any).auditEntity?.name ??
      (audits[0] as any).entityName ??
      audits[0].title;

    // Get org name if available
    const org = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { name: true },
    });

    return this.aiService.multiYearAnalysis({
      audits: auditPayload,
      organizationName: org?.name,
      auditEntityName: entityName,
    });
  }
}

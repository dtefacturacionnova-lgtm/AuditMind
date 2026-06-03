import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get()
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Listar auditorías disponibles para generar informe' })
  listAvailable(@CurrentUser() user: AuthUser) {
    return this.service.listAvailableReports(user);
  }

  @Get('audit/:id')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Datos completos para informe de auditoría' })
  getAuditReport(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.getAuditReport(id, user);
  }

  // ─── PDFs server-side con Puppeteer ────────────────────────────────────────
  @Get('audit/:id/pdf')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Descargar informe de auditoría en PDF (Puppeteer)' })
  async getAuditPdf(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const pdf = await this.service.generateAuditPdf(id, user);
    const filename = `auditmind_informe_${id.slice(0, 8)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  }

  @Get('finding/:id/pdf')
  @Roles(UserRole.AUDITOR)
  @ApiOperation({ summary: 'Descargar hallazgo individual en PDF' })
  async getFindingPdf(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const pdf = await this.service.generateFindingPdf(id, user);
    const filename = `auditmind_hallazgo_${id.slice(0, 8)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  }
}

import { Injectable } from '@nestjs/common';
import { QaipTrack } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IIA_INTERNAL_STANDARDS, NIGC_EXTERNAL_STANDARDS, StandardSeed } from './qaip-standards-seed';

const CATALOG: Record<QaipTrack, StandardSeed[]> = {
  IIA_INTERNAL: IIA_INTERNAL_STANDARDS,
  NIGC_EXTERNAL: NIGC_EXTERNAL_STANDARDS,
};

@Injectable()
export class StandardsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Siembra el catálogo global si está vacío — se llama de forma perezosa,
   *  igual que ensureSystemTemplates()/ensureSystemLibrary(). */
  async ensureSeeded(): Promise<void> {
    const count = await this.prisma.qaipStandard.count();
    if (count > 0) return;
    await this.reseed();
  }

  /** Restaura el catálogo desde el código fuente — upsert por (track, code),
   *  nunca borra evaluaciones ya calificadas (QaipAssessmentItem apunta por FK,
   *  no se toca aquí). */
  async reseed(): Promise<{ upserted: number }> {
    let upserted = 0;
    for (const track of Object.keys(CATALOG) as QaipTrack[]) {
      for (const s of CATALOG[track]) {
        await this.prisma.qaipStandard.upsert({
          where: { track_code: { track, code: s.code } },
          create: { track, code: s.code, component: s.component, title: s.title, guidance: s.guidance, sortOrder: s.sortOrder },
          update: { component: s.component, title: s.title, guidance: s.guidance, sortOrder: s.sortOrder, active: true },
        });
        upserted++;
      }
    }
    return { upserted };
  }

  async listByTrack(track: QaipTrack) {
    await this.ensureSeeded();
    return this.prisma.qaipStandard.findMany({
      where: { track, active: true },
      orderBy: { sortOrder: 'asc' },
    });
  }
}

import { PrismaService } from '../../prisma/prisma.service';

export async function generateWorkingPaperCode(
  prisma: PrismaService,
  auditId: string,
  indexSection: string,
): Promise<string> {
  const count = await prisma.workingPaper.count({
    where: { auditId, indexSection },
  });
  return `${indexSection}-${String(count + 1).padStart(2, '0')}`;
}

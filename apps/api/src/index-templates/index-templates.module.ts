import { Module } from '@nestjs/common';
import { IndexTemplatesController } from './index-templates.controller';
import { IndexTemplatesService } from './index-templates.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [IndexTemplatesController],
  providers: [IndexTemplatesService],
  exports: [IndexTemplatesService],    // Exportado para uso en AuditFoldersModule
})
export class IndexTemplatesModule {}

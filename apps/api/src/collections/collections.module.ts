import { Module } from '@nestjs/common';
import { CollectionsController } from './collections.controller';
import { FeesService } from './fees.service';
import { InvoicesService } from './invoices.service';
import { PaymentsService } from './payments.service';
import { CreditNotesService } from './credit-notes.service';
import { WriteOffsService } from './write-offs.service';
import { CollectionNotesService } from './collection-notes.service';
import { CollectionReportsService } from './reports.service';
import { AccrualService } from './accrual.service';

@Module({
  controllers: [CollectionsController],
  providers: [FeesService, InvoicesService, PaymentsService, CreditNotesService, WriteOffsService, CollectionNotesService, CollectionReportsService, AccrualService],
  exports: [FeesService, InvoicesService, PaymentsService, CreditNotesService, WriteOffsService, CollectionNotesService, CollectionReportsService, AccrualService],
})
export class CollectionsModule {}

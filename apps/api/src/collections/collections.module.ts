import { Module } from '@nestjs/common';
import { CollectionsController } from './collections.controller';
import { FeesService } from './fees.service';
import { InvoicesService } from './invoices.service';
import { PaymentsService } from './payments.service';

@Module({
  controllers: [CollectionsController],
  providers: [FeesService, InvoicesService, PaymentsService],
  exports: [FeesService, InvoicesService, PaymentsService],
})
export class CollectionsModule {}

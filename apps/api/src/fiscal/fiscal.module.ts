import { Module } from '@nestjs/common';
import { FiscalController } from './fiscal.controller';
import { DteValidatorService } from './dte-validator.service';
import { DgiiService } from './dgii.service';
import { Anexo12Service } from './anexo12.service';

@Module({
  controllers: [FiscalController],
  providers: [DteValidatorService, DgiiService, Anexo12Service],
  exports: [DteValidatorService, DgiiService, Anexo12Service],
})
export class FiscalModule {}

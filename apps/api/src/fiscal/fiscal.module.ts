import { Module } from '@nestjs/common';
import { FiscalController } from './fiscal.controller';
import { DteValidatorService } from './dte-validator.service';

@Module({
  controllers: [FiscalController],
  providers: [DteValidatorService],
  exports: [DteValidatorService],
})
export class FiscalModule {}

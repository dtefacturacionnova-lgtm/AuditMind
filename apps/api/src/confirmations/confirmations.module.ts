import { Module } from '@nestjs/common';
import { ConfirmationsController } from './confirmations.controller';
import { ConfirmationsService } from './confirmations.service';

@Module({
  controllers: [ConfirmationsController],
  providers: [ConfirmationsService],
  exports: [ConfirmationsService],
})
export class ConfirmationsModule {}

import { Module } from '@nestjs/common';
import { PbcController } from './pbc.controller';
import { PbcService } from './pbc.service';

@Module({
  controllers: [PbcController],
  providers: [PbcService],
  exports: [PbcService],
})
export class PbcModule {}

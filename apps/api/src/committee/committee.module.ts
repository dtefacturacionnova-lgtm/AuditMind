import { Module } from '@nestjs/common';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { CapacityModule } from '../capacity/capacity.module';
import { CommitteeController } from './committee.controller';
import { CommitteeService } from './committee.service';

@Module({
  imports: [PortfolioModule, CapacityModule],
  controllers: [CommitteeController],
  providers: [CommitteeService],
})
export class CommitteeModule {}

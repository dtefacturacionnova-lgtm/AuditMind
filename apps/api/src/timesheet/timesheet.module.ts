import { Module } from '@nestjs/common';
import { TimesheetController } from './timesheet.controller';
import { TimesheetService } from './timesheet.service';
import { HoursCloseController } from './hours-close.controller';
import { HoursCloseService } from './hours-close.service';
import { HoursCloseScheduler } from './hours-close.scheduler';

@Module({
  controllers: [TimesheetController, HoursCloseController],
  providers: [TimesheetService, HoursCloseService, HoursCloseScheduler],
  exports: [TimesheetService, HoursCloseService],
})
export class TimesheetModule {}

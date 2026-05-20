import { PartialType } from '@nestjs/swagger';
import { CreateAuditableUnitDto } from './create-auditable-unit.dto';

export class UpdateAuditableUnitDto extends PartialType(CreateAuditableUnitDto) {}

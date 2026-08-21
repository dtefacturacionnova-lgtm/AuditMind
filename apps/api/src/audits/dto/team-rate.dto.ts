import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export const BILLING_RATE_TYPES = ['COST', 'TIER1', 'TIER2', 'TIER3'] as const;
export type BillingRateType = (typeof BILLING_RATE_TYPES)[number];

export class UpdateTeamMemberRateDto {
  @ApiProperty({ enum: BILLING_RATE_TYPES, description: 'Tarifa pactada con el cliente para este miembro del equipo' })
  @IsIn(BILLING_RATE_TYPES)
  billingRateType: BillingRateType;
}

import { PartialType, OmitType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateOrganizationDto } from './create-organization.dto';

// adminEmail/adminName solo tienen sentido al CREAR la organización (invitan al
// primer administrador) — al actualizar se invita vía POST :id/invite-admin.
export class UpdateOrganizationDto extends PartialType(
  OmitType(CreateOrganizationDto, ['adminEmail', 'adminName'] as const),
) {
  @ApiPropertyOptional({ description: 'Activar/desactivar la organización (solo SUPER_ADMIN).' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

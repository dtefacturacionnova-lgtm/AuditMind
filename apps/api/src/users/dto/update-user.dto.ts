import { IsString, IsOptional, IsEnum, IsBoolean, IsUrl } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Juan Pérez' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Auditor Senior' })
  @IsOptional()
  @IsString()
  position?: string;

  @ApiPropertyOptional({ example: 'Auditoría Interna' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ example: 'formal' })
  @IsOptional()
  @IsString()
  aiAssistantPersonality?: string;
}

export class UpdateUserRoleDto {
  @ApiPropertyOptional({ enum: UserRole })
  @IsEnum(UserRole)
  role: UserRole;
}

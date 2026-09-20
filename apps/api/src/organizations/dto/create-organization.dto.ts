import { IsString, IsOptional, IsEmail, IsNumber, Min, Max, IsHexColor, IsEnum, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrgAuditModality } from '@prisma/client';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Empresa ABC S.A.' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: '12.345.678-9' })
  @IsOptional()
  @IsString()
  rut?: string;

  @ApiPropertyOptional({ example: 'Retail' })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional({ example: 'Chile' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: '#0F2D4A' })
  @IsOptional()
  @IsHexColor()
  primaryColor?: string;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(500)
  maxUsers?: number;

  @ApiPropertyOptional({ example: 'PROFESSIONAL' })
  @IsOptional()
  @IsString()
  subscriptionTier?: string;

  @ApiPropertyOptional({
    enum: OrgAuditModality,
    example: OrgAuditModality.BOTH,
    description: 'Módulos habilitados: INTERNAL (Auditoría Interna), EXTERNAL (Externa) o BOTH. Default BOTH.',
  })
  @IsOptional()
  @IsEnum(OrgAuditModality)
  auditModality?: OrgAuditModality;

  @ApiPropertyOptional({
    example: 'socio@despacho.com',
    description: 'Si se envía, se invita a esta persona como ADMIN de la organización nueva (ella define su propia contraseña).',
  })
  @IsOptional()
  @IsEmail()
  adminEmail?: string;

  @ApiPropertyOptional({ example: 'Nombre del administrador' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  adminName?: string;
}

export class InviteOrgAdminDto {
  @ApiProperty({ example: 'socio@despacho.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Nombre del administrador' })
  @IsString()
  @MinLength(2)
  name: string;
}

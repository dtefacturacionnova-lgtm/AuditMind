import {
  IsString, IsOptional, IsNumber, IsUUID,
  Min, Max, IsArray, IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAuditableUnitDto {
  @ApiProperty({ example: 'Tesorería y Gestión de Caja' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Gestión de los fondos disponibles' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Finanzas' })
  @IsOptional()
  @IsString()
  division?: string;

  @ApiPropertyOptional({ example: 'Contabilidad y Finanzas' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ example: 'Chile' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ example: 'HIGH' })
  @IsOptional()
  @IsString()
  inherentRiskLevel?: string;

  @ApiPropertyOptional({ example: 85 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  riskScore?: number;

  @ApiPropertyOptional({ example: 'user-uuid' })
  @IsOptional()
  @IsUUID()
  responsibleId?: string;

  @ApiPropertyOptional({ example: ['FINANCIAL', 'COMPLIANCE'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableAuditTypes?: string[];

  @ApiPropertyOptional({ example: 'IIA_2025,COMPLIANCE' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

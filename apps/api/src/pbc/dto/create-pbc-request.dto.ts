import {
  IsString,
  IsOptional,
  IsDateString,
  IsEmail,
  IsArray,
  ArrayMaxSize,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
import { StrictBoolean } from '../../common/validators/strict-boolean.decorator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePbcRequestDto {
  @ApiProperty({ example: 'audit-cuid-here' })
  @IsString()
  auditId: string;

  @ApiProperty({ example: 'Estados financieros del período 2025' })
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'contacto@empresa.cl' })
  @IsEmail()
  assignedToEmail: string;

  @ApiPropertyOptional({ example: 'María González' })
  @IsOptional()
  @IsString()
  assignedToName?: string;

  @ApiProperty({ example: '2026-06-30' })
  @IsDateString()
  dueDate: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @StrictBoolean()
  isConfidential?: boolean;
}

/**
 * Los nombres o enlaces que escribe el auditado no pueden ser direcciones del almacenamiento interno: el equipo auditor
 * los vería después como enlaces firmados a archivos del bucket privado (revisión de seguridad F5b, 2026-10-19).
 */
const NO_STORAGE_URL = /^(?![\s\S]*\/storage\/v1\/object\/)/;
const NO_STORAGE_URL_MSG = 'Los adjuntos no pueden ser direcciones del almacenamiento interno de AuditMind.';

// Lo que escribe el auditado en el portal PÚBLICO: se acota el tamaño de todo (sin login, cualquiera con el enlace puede enviar).
export class AddPortalMessageDto {
  @ApiProperty({ maxLength: 5000 })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  @Matches(NO_STORAGE_URL, { each: true, message: NO_STORAGE_URL_MSG })
  attachmentUrls?: string[];
}

export class SubmitPortalDto {
  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  auditeeNotes?: string;

  @ApiPropertyOptional({ type: [String], description: 'Array of file names or URLs adjuntos' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  @Matches(NO_STORAGE_URL, { each: true, message: NO_STORAGE_URL_MSG })
  fileUrls?: string[];
}

export class AddAuditorMessageDto {
  @ApiProperty()
  @IsString()
  content: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentUrls?: string[];
}

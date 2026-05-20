import {
  IsString, IsOptional, IsDateString, IsEmail, IsBoolean, IsArray,
} from 'class-validator';
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
  @IsBoolean()
  isConfidential?: boolean;
}

export class SubmitPbcResponseDto {
  @ApiProperty()
  @IsString()
  portalToken: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  auditeeNotes?: string;
}

export class AddPortalMessageDto {
  @ApiProperty()
  @IsString()
  content: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentUrls?: string[];
}

export class SubmitPortalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  auditeeNotes?: string;

  @ApiPropertyOptional({ type: [String], description: 'Array of file names or URLs adjuntos' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
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

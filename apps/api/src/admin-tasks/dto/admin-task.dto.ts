import {
  IsString, IsOptional, IsDateString, IsEnum, MaxLength,
} from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { AdminTaskStatus } from '@prisma/client';

export class CreateAdminTaskDto {
  @ApiProperty({ example: 'Renovar certificación ISO 27001 del equipo' })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'User.id del responsable. Si se omite, queda asignada a quien la crea.' })
  @IsOptional()
  @IsString()
  assignedToId?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class UpdateAdminTaskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedToId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class UpdateAdminTaskStatusDto {
  @ApiProperty({ enum: AdminTaskStatus })
  @IsEnum(AdminTaskStatus)
  status: AdminTaskStatus;
}

export class ListAdminTasksQueryDto {
  @ApiPropertyOptional({ enum: AdminTaskStatus })
  @IsOptional()
  @IsEnum(AdminTaskStatus)
  status?: AdminTaskStatus;

  @ApiPropertyOptional({ description: 'Filtra por responsable — solo AUDIT_MANAGER+ puede ver tareas de otra persona.' })
  @IsOptional()
  @IsString()
  assignedToId?: string;
}

import { IsString, IsOptional, IsNumber } from 'class-validator';
import { StrictBoolean } from '../../common/validators/strict-boolean.decorator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateObjectiveDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() color?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() icon?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() sortOrder?: number;
}
export class UpdateObjectiveDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() color?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() icon?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @StrictBoolean() active?: boolean;
}
export class CreateLineDto {
  @ApiProperty() @IsString() objectiveId: string;
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() sortOrder?: number;
}
export class UpdateLineDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @StrictBoolean() active?: boolean;
}

import { IsEmail, IsEnum, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

/**
 * Antes el cuerpo de POST /auth/invite era un tipo en línea
 * (`{ email; name; role: string }`): Nest lo refleja como `Object` y el
 * ValidationPipe global no valida nada — cualquier texto llegaba como rol.
 */
export class InviteUserDto {
  @ApiProperty({ example: 'persona@despacho.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Nombre Apellido' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: UserRole, example: UserRole.AUDITOR })
  @IsEnum(UserRole)
  role!: UserRole;
}

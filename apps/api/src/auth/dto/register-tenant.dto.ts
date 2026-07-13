import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class RegisterTenantDto {
  @ApiProperty({ example: 'Taller Eléctrico Bogotá' })
  @IsString()
  @MinLength(2)
  workshopName: string;

  @ApiProperty({
    example: 'taller-bogota',
    description: 'Identificador único (subdominio) del taller',
  })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug solo puede contener minúsculas, números y guiones',
  })
  slug: string;

  @ApiProperty({ example: 'Ana' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Gómez' })
  @IsString()
  lastName: string;

  @ApiProperty({ example: 'admin@tallerbogota.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(8)
  password: string;
}

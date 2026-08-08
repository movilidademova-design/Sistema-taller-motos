import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { PosRole, Role } from '../../generated/prisma/enums';

export class CreateUserDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty()
  @IsString()
  firstName: string;

  @ApiProperty()
  @IsString()
  lastName: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  // Los dos son opcionales por separado, pero UsersService exige que al menos
  // uno venga: un usuario sin ningún sistema no podría entrar a nada.
  @ApiProperty({ enum: Role, required: false, nullable: true })
  @IsOptional()
  @IsEnum(Role)
  role?: Role | null;

  @ApiProperty({ enum: PosRole, required: false, nullable: true })
  @IsOptional()
  @IsEnum(PosRole)
  posRole?: PosRole | null;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  branchIds?: string[];
}

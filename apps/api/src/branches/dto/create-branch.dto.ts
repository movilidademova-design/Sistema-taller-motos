import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches } from 'class-validator';

export class CreateBranchDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ example: '2056' })
  @IsString()
  @Matches(/^\d{4}$/, { message: 'El código debe tener exactamente 4 dígitos' })
  code: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  email?: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateAccessoryOptionDto {
  @ApiProperty({ example: 'Casco' })
  @IsString()
  @MinLength(1)
  label: string;
}

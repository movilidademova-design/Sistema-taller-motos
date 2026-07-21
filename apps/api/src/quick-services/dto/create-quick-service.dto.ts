import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateQuickServiceDto {
  @ApiProperty({ example: 'Mantenimiento 3ro' })
  @IsString()
  @MinLength(1)
  label: string;
}

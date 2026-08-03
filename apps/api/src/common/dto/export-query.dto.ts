import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class ExportQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, description: 'Fecha inicial (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({
    required: false,
    description: 'Fecha final (YYYY-MM-DD), inclusive',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiProperty({
    required: false,
    description:
      'Solo lo usa un ADMIN; en un MANAGER se ignora y se usa su sucursal activa.',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

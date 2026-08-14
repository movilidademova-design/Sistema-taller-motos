import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';
import { BlankToUndefined } from './blank-to-undefined.decorator';

export class ExportQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, description: 'Fecha inicial (YYYY-MM-DD)' })
  @BlankToUndefined()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({
    required: false,
    description: 'Fecha final (YYYY-MM-DD), inclusive',
  })
  @BlankToUndefined()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiProperty({
    required: false,
    description:
      'Solo lo usa un ADMIN; en un MANAGER se ignora y se usa su sucursal activa.',
  })
  @BlankToUndefined()
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

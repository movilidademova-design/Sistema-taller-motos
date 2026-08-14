import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { BlankToUndefined } from '../../../common/dto/blank-to-undefined.decorator';

/**
 * Filtro común a los reportes y exportaciones del POS: rango de fechas +
 * sucursal. A diferencia de `ExportQueryDto` (taller) no lleva `search`:
 * ninguno de estos reportes busca por texto libre.
 */
export class PosExportQueryDto {
  @ApiPropertyOptional({ description: 'Fecha inicial (YYYY-MM-DD)' })
  @BlankToUndefined()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Fecha final (YYYY-MM-DD), inclusive',
  })
  @BlankToUndefined()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description:
      'Solo lo usa un ADMIN; por defecto se usa la sucursal activa (X-Branch-Id).',
  })
  @BlankToUndefined()
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

/**
 * Filtro común a los reportes y exportaciones del POS: rango de fechas +
 * sucursal. A diferencia de `ExportQueryDto` (taller) no lleva `search`:
 * ninguno de estos reportes busca por texto libre.
 */
export class PosExportQueryDto {
  @ApiPropertyOptional({ description: 'Fecha inicial (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Fecha final (YYYY-MM-DD), inclusive',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description:
      'Solo lo usa un ADMIN; por defecto se usa la sucursal activa (X-Branch-Id).',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

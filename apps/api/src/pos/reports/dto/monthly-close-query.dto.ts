import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, Matches } from 'class-validator';
import { BlankToUndefined } from '../../../common/dto/blank-to-undefined.decorator';

export class MonthlyCloseQueryDto {
  @ApiProperty({ description: 'Mes a cerrar, formato AAAA-MM' })
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'month debe tener el formato AAAA-MM',
  })
  month: string;

  @ApiPropertyOptional({
    description:
      'Sucursal a cerrar. El cierre es siempre de UNA sucursal (así lo espera ' +
      'el contador, un archivo por bodega); sin este parámetro se usa la ' +
      'sucursal activa (X-Branch-Id).',
  })
  @BlankToUndefined()
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

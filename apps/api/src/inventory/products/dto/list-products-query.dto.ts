import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { BlankToUndefined } from '../../../common/dto/blank-to-undefined.decorator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/** Clase, no intersección — ver la nota en ListOrdersQueryDto. */
export class ListProductsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @BlankToUndefined()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  // Sin esto llega la cadena "false", que es verdadera al evaluarla.
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  lowStock?: boolean;
}

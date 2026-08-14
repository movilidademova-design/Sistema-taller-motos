import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { BlankToUndefined } from '../../common/dto/blank-to-undefined.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

/** Clase, no intersección — ver la nota en ListOrdersQueryDto. */
export class ListMotorcyclesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @BlankToUndefined()
  @IsOptional()
  @IsUUID()
  clientId?: string;
}

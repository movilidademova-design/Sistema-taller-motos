import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { BlankToUndefined } from '../../common/dto/blank-to-undefined.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { OrderStatus } from '../../generated/prisma/enums';

/**
 * Tiene que ser una clase, no `PaginationQueryDto & { ... }`: con un tipo
 * intersección TypeScript emite `Object` como metatipo y NestJS se salta la
 * transformación, así que `page`/`pageSize` llegan como texto y Prisma revienta
 * con "Expected Int, provided String".
 */
export class ListOrdersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional()
  @BlankToUndefined()
  @IsOptional()
  @IsUUID()
  technicianId?: string;

  @ApiPropertyOptional()
  @BlankToUndefined()
  @IsOptional()
  @IsUUID()
  clientId?: string;
}

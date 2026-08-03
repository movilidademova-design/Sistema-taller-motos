import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ExportQueryDto } from '../../common/dto/export-query.dto';
import { OrderStatus } from '../../generated/prisma/enums';

export class ExportOrdersQueryDto extends ExportQueryDto {
  @ApiProperty({ required: false, enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}

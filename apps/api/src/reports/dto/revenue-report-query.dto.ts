import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ExportQueryDto } from '../../common/dto/export-query.dto';

export enum RevenueGroupBy {
  DAY = 'day',
  MONTH = 'month',
}

export class RevenueReportQueryDto extends ExportQueryDto {
  @ApiProperty({
    required: false,
    enum: RevenueGroupBy,
    default: RevenueGroupBy.MONTH,
  })
  @IsOptional()
  @IsEnum(RevenueGroupBy)
  groupBy?: RevenueGroupBy;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ExportQueryDto } from '../../common/dto/export-query.dto';
import { InvoiceStatus } from '../../generated/prisma/enums';

export class ExportInvoicesQueryDto extends ExportQueryDto {
  @ApiProperty({ required: false, enum: InvoiceStatus })
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;
}

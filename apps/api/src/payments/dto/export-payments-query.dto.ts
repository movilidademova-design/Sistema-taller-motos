import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ExportQueryDto } from '../../common/dto/export-query.dto';
import { PaymentMethod } from '../../generated/prisma/enums';

export class ExportPaymentsQueryDto extends ExportQueryDto {
  @ApiProperty({ required: false, enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;
}

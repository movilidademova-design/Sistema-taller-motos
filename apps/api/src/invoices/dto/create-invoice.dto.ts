import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateInvoiceDto {
  @ApiProperty()
  @IsUUID()
  orderId: string;
}

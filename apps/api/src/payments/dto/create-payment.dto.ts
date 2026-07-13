import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { PaymentMethod } from '../../generated/prisma/enums';

export class CreatePaymentDto {
  @ApiProperty()
  @IsUUID()
  clientId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  invoiceId?: string;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reference?: string;
}

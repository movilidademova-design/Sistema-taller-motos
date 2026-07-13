import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class UpdateOrderDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  technicianId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  estimatedDeliveryAt?: string;
}

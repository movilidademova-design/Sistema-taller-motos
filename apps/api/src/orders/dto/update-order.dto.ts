import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { BlankToUndefined } from '../../common/dto/blank-to-undefined.decorator';

export class UpdateOrderDto {
  @ApiProperty({ required: false })
  @BlankToUndefined()
  @IsOptional()
  @IsUUID()
  technicianId?: string;

  @ApiProperty({ required: false })
  @BlankToUndefined()
  @IsOptional()
  @IsDateString()
  estimatedDeliveryAt?: string;
}

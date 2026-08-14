import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { BlankToUndefined } from '../../common/dto/blank-to-undefined.decorator';

export class CreateOrderDto {
  @ApiProperty()
  @IsUUID()
  clientId: string;

  @ApiProperty()
  @IsUUID()
  motorcycleId: string;

  @ApiProperty({
    required: false,
    description: 'Técnico asignado (opcional al recibir)',
  })
  @BlankToUndefined()
  @IsOptional()
  @IsUUID()
  technicianId?: string;

  @ApiProperty()
  @IsString()
  reason: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  accessoriesDelivered?: string;
}

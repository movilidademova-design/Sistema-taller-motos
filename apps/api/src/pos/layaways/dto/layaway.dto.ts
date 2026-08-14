import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PosLayawayStatus } from '../../../generated/pos/enums';
import type { DiscountType } from '../../sales/sale-pricing.util';
import { BlankToUndefined } from '../../../common/dto/blank-to-undefined.decorator';

export class CreateLayawayItemDto {
  @ApiPropertyOptional()
  @BlankToUndefined()
  @IsOptional()
  @IsUUID()
  productId?: string;

  // Igual que en CreateSaleItemDto: solo obligatorio en ítems sueltos.
  @ApiPropertyOptional()
  @ValidateIf((o: CreateLayawayItemDto) => !o.productId)
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional()
  @ValidateIf((o: CreateLayawayItemDto) => !o.productId)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiPropertyOptional({ enum: ['pct', 'amount'], default: 'pct' })
  @IsOptional()
  @IsIn(['pct', 'amount'])
  discountType?: DiscountType;

  // Motor y chasis NO se piden aquí a propósito: se capturan al entregar
  // (ver AddLayawayPaymentItemDto), porque al apartar todavía no se sabe qué
  // unidad concreta se va a entregar.
}

export class CreateLayawayPaymentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  method: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;
}

export class CreateLayawayDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  clientName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clientDoc?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clientPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [CreateLayawayItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateLayawayItemDto)
  items: CreateLayawayItemDto[];

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  generalDiscount?: number;

  @ApiPropertyOptional({ enum: ['pct', 'amount'], default: 'pct' })
  @IsOptional()
  @IsIn(['pct', 'amount'])
  generalDiscountType?: DiscountType;

  // Abono inicial obligatorio (app.py línea 1428): un separado que nace sin
  // abono no es un separado.
  @ApiProperty({ type: CreateLayawayPaymentDto })
  @ValidateNested()
  @Type(() => CreateLayawayPaymentDto)
  payment: CreateLayawayPaymentDto;
}

/** Motor y chasis de un ítem, capturados al momento de entregar (ver nota en CreateLayawayItemDto). */
export class LayawayItemDeliveryDto {
  @ApiProperty()
  @IsUUID()
  layawayItemId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  engineNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chassisNumber?: string;
}

export class AddLayawayPaymentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  method: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  // Solo se aplica si este abono completa el separado (app.py línea 1553);
  // si se manda en un abono parcial, se ignora igual que hace app.py.
  @ApiPropertyOptional({ type: [LayawayItemDeliveryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LayawayItemDeliveryDto)
  items?: LayawayItemDeliveryDto[];
}

export class ListLayawaysQueryDto {
  @ApiPropertyOptional({ enum: PosLayawayStatus })
  @IsOptional()
  @IsEnum(PosLayawayStatus)
  status?: PosLayawayStatus;
}

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
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PosSaleStatus } from '../../../generated/pos/enums';
import type { DiscountType } from '../sale-pricing.util';
import { BlankToUndefined } from '../../../common/dto/blank-to-undefined.decorator';

export class CreateSaleItemDto {
  @ApiPropertyOptional()
  @BlankToUndefined()
  @IsOptional()
  @IsUUID()
  productId?: string;

  // Solo obligatorio en ítems sueltos (sin productId): el nombre y el precio
  // de un producto del catálogo se leen del producto, no de lo que mande el
  // cliente — ver la nota de "Snapshot de la línea" en sales.service.ts.
  @ApiPropertyOptional()
  @ValidateIf((o: CreateSaleItemDto) => !o.productId)
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional()
  @ValidateIf((o: CreateSaleItemDto) => !o.productId)
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

  // Solo para motos; el cierre mensual los exige. Se guardan tal cual lleguen.
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  engineNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chassisNumber?: string;
}

export class CreateSalePaymentDto {
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

export class CreateSaleDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  clientName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clientDoc?: string;

  @ApiProperty({ type: [CreateSaleItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items: CreateSaleItemDto[];

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

  // Pago dividido tipado, a diferencia de la cadena "efectivo:1000,tarjeta:500"
  // que parsea app.py con un try/except que se traga errores.
  @ApiProperty({ type: [CreateSalePaymentDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSalePaymentDto)
  payments: CreateSalePaymentDto[];
}

/** Clase, no intersección — ver la nota en ListOrdersQueryDto. */
export class ListPosSalesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PosSaleStatus })
  @IsOptional()
  @IsEnum(PosSaleStatus)
  status?: PosSaleStatus;
}

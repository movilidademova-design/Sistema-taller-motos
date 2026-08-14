import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PosProductCategory } from '../../../generated/pos/enums';
import { BlankToUndefined } from '../../../common/dto/blank-to-undefined.decorator';

export class CreatePosProductDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ enum: PosProductCategory })
  @IsEnum(PosProductCategory)
  category: PosProductCategory;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ default: 0, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cost?: number;

  @ApiProperty({ default: 0, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  supplier?: string;

  @ApiProperty({ required: false })
  @BlankToUndefined()
  @IsOptional()
  @IsDateString()
  entryDate?: string;
}

export class UpdatePosProductDto extends PartialType(CreatePosProductDto) {}

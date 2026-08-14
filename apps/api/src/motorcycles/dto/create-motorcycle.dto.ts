import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { BlankToUndefined } from '../../common/dto/blank-to-undefined.decorator';

export class CreateMotorcycleDto {
  @ApiProperty()
  @IsUUID()
  clientId: string;

  @ApiProperty()
  @IsString()
  brand: string;

  @ApiProperty()
  @IsString()
  model: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  serialNumber?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  motorNumber?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  batteryNumber?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  batteryCapacity?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  voltage?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  controller?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  display?: string;

  @ApiProperty({ required: false })
  @BlankToUndefined()
  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @ApiProperty({ required: false })
  @BlankToUndefined()
  @IsOptional()
  @IsDateString()
  warrantyUntil?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  mileage?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  photoUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  observations?: string;
}

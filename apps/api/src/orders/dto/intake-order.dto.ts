import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { NewClientIntakeDto } from './new-client-intake.dto';
import { NewVehicleIntakeDto } from './new-vehicle-intake.dto';

function parseIfString(value: unknown) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

export class IntakeOrderDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiProperty({ required: false, type: NewClientIntakeDto })
  @IsOptional()
  @Transform(({ value }) => parseIfString(value))
  @ValidateNested()
  @Type(() => NewClientIntakeDto)
  newClient?: NewClientIntakeDto;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  motorcycleId?: string;

  @ApiProperty({ required: false, type: NewVehicleIntakeDto })
  @IsOptional()
  @Transform(({ value }) => parseIfString(value))
  @ValidateNested()
  @Type(() => NewVehicleIntakeDto)
  newMotorcycle?: NewVehicleIntakeDto;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @Transform(({ value }) => parseIfString(value))
  quickServiceIds?: string[];

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;
}

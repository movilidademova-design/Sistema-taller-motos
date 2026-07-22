import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { plainToInstance, Transform } from 'class-transformer';
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

function parseIfJsonString(value: unknown, fieldName: string): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new BadRequestException(`El campo "${fieldName}" no es JSON válido`);
  }
}

function parseNestedField<T extends object>(
  value: unknown,
  dtoClass: new () => T,
  fieldName: string,
): T | undefined {
  if (value === undefined || value === null) return undefined;
  return plainToInstance(dtoClass, parseIfJsonString(value, fieldName));
}

export class IntakeOrderDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiProperty({ required: false, type: NewClientIntakeDto })
  @IsOptional()
  @Transform(({ value }) => parseNestedField(value, NewClientIntakeDto, 'newClient'))
  @ValidateNested()
  newClient?: NewClientIntakeDto;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  motorcycleId?: string;

  @ApiProperty({ required: false, type: NewVehicleIntakeDto })
  @IsOptional()
  @Transform(({ value }) => parseNestedField(value, NewVehicleIntakeDto, 'newMotorcycle'))
  @ValidateNested()
  newMotorcycle?: NewVehicleIntakeDto;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @Transform(({ value }) => parseIfJsonString(value, 'quickServiceIds'))
  quickServiceIds?: string[];

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;
}

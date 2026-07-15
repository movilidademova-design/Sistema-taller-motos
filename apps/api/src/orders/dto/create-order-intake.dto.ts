import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { VehicleType } from '../../generated/prisma/enums';

export class NewClientDto {
  @ApiProperty()
  @IsString()
  documentId: string;

  @ApiProperty()
  @IsString()
  firstName: string;

  @ApiProperty()
  @IsString()
  lastName: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address?: string;
}

export class NewVehicleDto {
  @ApiProperty({ enum: VehicleType })
  @IsEnum(VehicleType)
  vehicleType: VehicleType;

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
  @IsDateString()
  purchaseDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  serialNumber?: string;
}

/**
 * Recibido como el campo de texto "payload" dentro de un multipart/form-data
 * (junto a los archivos de fotos y firma) — se parsea con JSON.parse y se
 * valida a mano en el controller, ya que el ValidationPipe global no
 * interpreta JSON anidado dentro de multipart.
 */
export class CreateOrderIntakeDto {
  @ApiProperty({ required: false, description: 'Cliente existente' })
  @ValidateIf((o: CreateOrderIntakeDto) => !o.newClient)
  @IsUUID()
  clientId?: string;

  @ApiProperty({ required: false, type: NewClientDto })
  @ValidateIf((o: CreateOrderIntakeDto) => !o.clientId)
  @ValidateNested()
  @Type(() => NewClientDto)
  newClient?: NewClientDto;

  @ApiProperty({ required: false, description: 'Vehículo existente' })
  @ValidateIf((o: CreateOrderIntakeDto) => !o.newVehicle)
  @IsUUID()
  motorcycleId?: string;

  @ApiProperty({ required: false, type: NewVehicleDto })
  @ValidateIf((o: CreateOrderIntakeDto) => !o.motorcycleId)
  @ValidateNested()
  @Type(() => NewVehicleDto)
  newVehicle?: NewVehicleDto;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('all', { each: true })
  quickServiceIds: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('all', { each: true })
  accessoryIds: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  otherAccessories?: string;

  @ApiProperty()
  @IsString()
  reason: string;

  @ApiProperty({ description: 'Debe ser true: el cliente aceptó los términos junto a su firma' })
  @IsBoolean()
  termsAccepted: boolean;
}

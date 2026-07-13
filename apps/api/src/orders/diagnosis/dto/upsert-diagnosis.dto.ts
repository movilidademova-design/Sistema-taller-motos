import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class DiagnosisPartDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  unitCost: number;
}

export class UpsertDiagnosisDto {
  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsString()
  faultFound: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  testsPerformed?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  batteryVoltage?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  controllerStatus?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  motorStatus?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  observations?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedTimeHours?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedCost?: number;

  @ApiProperty({ type: [DiagnosisPartDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DiagnosisPartDto)
  requiredParts?: DiagnosisPartDto[];
}

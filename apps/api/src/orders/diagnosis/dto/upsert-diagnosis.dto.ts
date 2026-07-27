import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

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
}

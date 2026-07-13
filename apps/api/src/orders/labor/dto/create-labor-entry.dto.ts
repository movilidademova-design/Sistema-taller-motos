import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateLaborEntryDto {
  @ApiProperty()
  @IsUUID()
  technicianId: string;

  @ApiProperty()
  @IsString()
  activity: string;

  @ApiProperty()
  @IsDateString()
  startTime: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  endTime?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;
}

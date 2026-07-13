import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import {
  AppointmentType,
  AppointmentStatus,
} from '../../generated/prisma/enums';

export class CreateAppointmentDto {
  @ApiProperty()
  @IsUUID()
  clientId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  motorcycleId?: string;

  @ApiProperty({ enum: AppointmentType })
  @IsEnum(AppointmentType)
  type: AppointmentType;

  @ApiProperty()
  @IsDateString()
  scheduledAt: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  endAt?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;
}

export class UpdateAppointmentDto extends PartialType(CreateAppointmentDto) {
  @ApiProperty({ required: false, enum: AppointmentStatus })
  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;
}

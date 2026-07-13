import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import {
  ChecklistItemType,
  ConditionRating,
} from '../../../generated/prisma/enums';

export class ChecklistItemDto {
  @ApiProperty({ enum: ChecklistItemType })
  @IsEnum(ChecklistItemType)
  item: ChecklistItemType;

  @ApiProperty({ enum: ConditionRating })
  @IsEnum(ConditionRating)
  condition: ConditionRating;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  observations?: string;
}

export class SetChecklistDto {
  @ApiProperty({ type: [ChecklistItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  items: ChecklistItemDto[];
}

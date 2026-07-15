import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateCatalogItemDto {
  @ApiProperty()
  @IsString()
  label: string;
}

export class UpdateCatalogItemDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ReorderCatalogDto {
  @ApiProperty({ type: [String] })
  @IsString({ each: true })
  orderedIds: string[];
}

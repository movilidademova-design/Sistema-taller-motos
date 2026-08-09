import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreatePosListDto {
  @ApiProperty()
  @IsString()
  type: string;

  @ApiProperty()
  @IsString()
  value: string;
}

export class ListPosListsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type?: string;
}

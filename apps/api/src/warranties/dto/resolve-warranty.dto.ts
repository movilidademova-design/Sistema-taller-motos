import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ResolveWarrantyDto {
  @ApiProperty()
  @IsString()
  result: string;
}

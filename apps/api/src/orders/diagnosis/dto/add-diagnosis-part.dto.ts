import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { BlankToUndefined } from '../../../common/dto/blank-to-undefined.decorator';

export class AddDiagnosisPartDto {
  @ApiProperty({ required: false })
  @BlankToUndefined()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  observations?: string;
}

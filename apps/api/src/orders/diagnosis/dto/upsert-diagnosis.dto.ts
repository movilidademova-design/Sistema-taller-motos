import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpsertDiagnosisDto {
  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  faultFound?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  testsPerformed?: string;
}

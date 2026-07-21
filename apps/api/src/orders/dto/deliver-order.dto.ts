import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class DeliverOrderDto {
  @ApiProperty({ example: '482931' })
  @IsString()
  @Length(6, 6)
  pickupCode: string;
}

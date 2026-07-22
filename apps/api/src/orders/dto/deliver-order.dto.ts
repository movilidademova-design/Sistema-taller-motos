import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class DeliverOrderDto {
  @ApiProperty({ example: '482931' })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'La clave de retiro debe tener 6 dígitos' })
  pickupCode: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class NotifyOrderDto {
  @ApiProperty({ enum: ['EMAIL'] })
  @IsIn(['EMAIL'])
  channel: 'EMAIL';
}

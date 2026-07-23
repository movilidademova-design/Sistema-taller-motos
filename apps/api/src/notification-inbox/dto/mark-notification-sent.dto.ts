import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class MarkNotificationSentDto {
  @ApiProperty({ enum: ['WHATSAPP', 'COPY'] })
  @IsIn(['WHATSAPP', 'COPY'])
  channel: 'WHATSAPP' | 'COPY';
}

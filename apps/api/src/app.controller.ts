import { Controller, Get } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  @Public()
  @ApiExcludeEndpoint()
  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}

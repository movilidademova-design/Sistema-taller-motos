import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // El límite global (200/min) es razonable para navegar la aplicación y
  // absurdo para adivinar contraseñas: permitía 40 intentos seguidos sin una
  // sola respuesta 429 (comprobado). Estas dos rutas son las únicas anónimas
  // que crean algo o validan credenciales, así que llevan su propio tope.
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @Public()
  @Post('register-tenant')
  registerTenant(@Body() dto: RegisterTenantDto, @Req() req: Request) {
    return this.authService.registerTenant(dto, req.ip);
  }

  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, req.ip);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    return this.authService.refresh(dto.refreshToken, req.ip);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
  }
}

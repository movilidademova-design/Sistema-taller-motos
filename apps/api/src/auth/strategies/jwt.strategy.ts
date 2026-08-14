import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { requireJwtSecret } from '../../common/config/jwt-secret.util';

export interface JwtPayload {
  sub: string;
  tenantId: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Sin valor por defecto a propósito. Antes había uno ('dev_access_secret…')
      // escrito en este mismo archivo: si la variable faltaba en producción, la
      // API seguía arrancando y aceptaba cualquier token firmado con un secreto
      // que está publicado en el repositorio. Es preferible no arrancar.
      secretOrKey: requireJwtSecret(config),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario inválido o inactivo');
    }
    // El payload del token no lleva rol a propósito: `validate` ya releyó al
    // usuario de la base, así que el rol siempre viene fresco. Meterlo en el
    // token haría que una sesión abierta conservara un rol revocado.
    return {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      posRole: user.posRole,
    };
  }
}

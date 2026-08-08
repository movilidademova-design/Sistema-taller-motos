import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { PosRole, Role } from '../generated/prisma/enums';
import {
  parseDurationToMs,
  parseDurationToSeconds,
} from '../common/utils/duration.util';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async registerTenant(dto: RegisterTenantDto, ip?: string) {
    const existingSlug = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug },
    });
    if (existingSlug) {
      throw new ConflictException('Ese identificador de taller ya está en uso');
    }
    const existingEmail = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingEmail) {
      throw new ConflictException('Ese correo ya está registrado');
    }

    const passwordHash = await argon2.hash(dto.password);

    const { tenant, user } = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.workshopName,
          slug: dto.slug,
        },
      });
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: Role.ADMIN,
        },
      });
      // Every tenant needs at least one branch to use branch-scoped features
      // (order/client/motorcycle creation all require @CurrentBranch()). ADMIN
      // sees all branches automatically, so this doesn't need a UserBranch row.
      await tx.branch.create({
        data: { tenantId: tenant.id, name: 'Principal', code: '0001' },
      });
      return { tenant, user };
    });

    const tokens = await this.issueTokens(
      user.id,
      tenant.id,
      user.email,
      user.role,
      ip,
    );
    return {
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async login(dto: LoginDto, ip?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokens(
      user.id,
      user.tenantId,
      user.email,
      user.role,
      ip,
    );
    return { user: this.sanitizeUser(user), ...tokens };
  }

  async refresh(rawRefreshToken: string, ip?: string) {
    const tokenHash = this.hashToken(rawRefreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException(
        'Token de actualización inválido o expirado',
      );
    }
    if (!stored.user.isActive) {
      throw new UnauthorizedException('Usuario inactivo');
    }

    // Rotate: revoke the used token and issue a fresh pair.
    const tokens = await this.issueTokens(
      stored.user.id,
      stored.user.tenantId,
      stored.user.email,
      stored.user.role,
      ip,
    );
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedByToken: tokens.refreshTokenId },
    });

    return {
      user: this.sanitizeUser(stored.user),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async logout(rawRefreshToken: string) {
    const tokenHash = this.hashToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  private async issueTokens(
    userId: string,
    tenantId: string,
    email: string,
    role: Role | null,
    ip?: string,
  ): Promise<TokenPair & { refreshTokenId: string }> {
    const payload = { sub: userId, tenantId, email, role };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: parseDurationToSeconds(
        this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m',
      ),
    });

    const rawRefreshToken = randomUUID() + randomUUID();
    const refreshTokenId = randomUUID();
    const expiresInMs = parseDurationToMs(
      this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
    );

    await this.prisma.refreshToken.create({
      data: {
        id: refreshTokenId,
        userId,
        tokenHash: this.hashToken(rawRefreshToken),
        expiresAt: new Date(Date.now() + expiresInMs),
        createdByIp: ip,
      },
    });

    return { accessToken, refreshToken: rawRefreshToken, refreshTokenId };
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private sanitizeUser(user: {
    id: string;
    tenantId: string;
    email: string;
    firstName: string;
    lastName: string;
    role: Role | null;
    posRole: PosRole | null;
  }) {
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      posRole: user.posRole,
    };
  }
}

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { AUDIT_ENTITY_KEY } from '../decorators/audit.decorator';
import { RequestWithUser } from '../decorators/current-user.decorator';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const entity = this.reflector.getAllAndOverride<string>(AUDIT_ENTITY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!entity) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const method = request.method;
    if (!MUTATING_METHODS.has(method)) {
      return next.handle();
    }

    const user = request.user;
    const ipAddress = request.ip;
    const action = `${method} ${entity}`;

    return next.handle().pipe(
      tap((result: unknown) => {
        if (!user) return;
        const resultId =
          result && typeof result === 'object' && 'id' in result
            ? result.id
            : undefined;
        const entityId = (resultId ?? request.params?.id ?? null) as
          string | null;
        this.prisma.auditLog
          .create({
            data: {
              tenantId: user.tenantId,
              userId: user.userId,
              action,
              entity,
              entityId,
              ipAddress,
              changes: {
                params: request.params,
                body: redactSensitive(request.body),
              } as Prisma.InputJsonValue,
            },
          })
          .catch(() => {
            // Audit logging must never break the primary request flow.
          });
      }),
    );
  }
}

function redactSensitive(body: unknown) {
  if (!body || typeof body !== 'object') return body;
  const clone = { ...(body as Record<string, unknown>) };
  for (const key of [
    'password',
    'passwordHash',
    'refreshToken',
    'accessToken',
  ]) {
    if (key in clone) clone[key] = '[REDACTED]';
  }
  return clone;
}

import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { requireJwtSecret } from '../common/config/jwt-secret.util';

/**
 * Pushes live order-status updates to connected clients so the dashboard and
 * order boards update without polling. Clients connect with
 * `io(url, { auth: { token: accessToken } })` and are placed into a
 * `tenant:<tenantId>` room so tenants never see each other's events.
 */
@WebSocketGateway({
  // Mismos orígenes que la API HTTP (main.ts). Estaba en '*', es decir que el
  // WebSocket aceptaba conexiones desde cualquier página web mientras el resto
  // de la API sí respetaba CORS_ORIGIN. El token sigue siendo obligatorio, así
  // que no era una vía de entrada por sí sola, pero no hay razón para que las
  // dos mitades de la misma API tengan políticas distintas.
  cors: {
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','),
    credentials: true,
  },
  namespace: 'realtime',
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string | undefined;
      if (!token) throw new Error('missing token');
      // El secreto sale del único sitio que lo valida. Antes había aquí una
      // segunda copia del valor de reserva escrito en el código: al corregir el
      // de la estrategia JWT, ESTE se quedó atrás y el WebSocket seguía
      // aceptando tokens firmados con una cadena publicada en el repositorio.
      const payload = await this.jwt.verifyAsync<{ tenantId: string }>(token, {
        secret: requireJwtSecret(this.config),
      });
      await client.join(`tenant:${payload.tenantId}`);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  emitOrderUpdated(tenantId: string, order: unknown) {
    this.server.to(`tenant:${tenantId}`).emit('order:updated', order);
  }

  emitDashboardRefresh(tenantId: string) {
    this.server.to(`tenant:${tenantId}`).emit('dashboard:refresh');
  }
}

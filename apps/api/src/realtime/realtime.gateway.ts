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

/**
 * Pushes live order-status updates to connected clients so the dashboard and
 * order boards update without polling. Clients connect with
 * `io(url, { auth: { token: accessToken } })` and are placed into a
 * `tenant:<tenantId>` room so tenants never see each other's events.
 */
@WebSocketGateway({
  cors: { origin: '*' },
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
      const payload = await this.jwt.verifyAsync<{ tenantId: string }>(token, {
        secret:
          this.config.get<string>('JWT_ACCESS_SECRET') ??
          'dev_access_secret_change_me_in_production',
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

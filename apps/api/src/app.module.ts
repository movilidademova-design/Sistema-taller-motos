import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { PdfModule } from './common/pdf/pdf.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TenantsModule } from './tenants/tenants.module';
import { ClientsModule } from './clients/clients.module';
import { MotorcyclesModule } from './motorcycles/motorcycles.module';
import { OrdersModule } from './orders/orders.module';
import { CatalogsModule } from './catalogs/catalogs.module';
import { OrderNotificationsModule } from './order-notifications/order-notifications.module';
import { InventoryModule } from './inventory/inventory.module';
import { PurchasesModule } from './purchases/purchases.module';
import { WarrantiesModule } from './warranties/warranties.module';
import { PaymentsModule } from './payments/payments.module';
import { InvoicesModule } from './invoices/invoices.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { StorageModule } from './storage/storage.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuditModule } from './audit/audit.module';
import { RealtimeModule } from './realtime/realtime.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 200 }]),
    PrismaModule,
    PdfModule,
    StorageModule,
    NotificationsModule,
    RealtimeModule,
    AuthModule,
    UsersModule,
    TenantsModule,
    ClientsModule,
    MotorcyclesModule,
    OrdersModule,
    CatalogsModule,
    OrderNotificationsModule,
    InventoryModule,
    PurchasesModule,
    WarrantiesModule,
    PaymentsModule,
    InvoicesModule,
    DashboardModule,
    AppointmentsModule,
    AuditModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}

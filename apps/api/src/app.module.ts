import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { PosModule } from './pos/pos.module';
import { PdfModule } from './common/pdf/pdf.module';
import { ExcelModule } from './common/excel/excel.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TenantsModule } from './tenants/tenants.module';
import { ClientsModule } from './clients/clients.module';
import { MotorcyclesModule } from './motorcycles/motorcycles.module';
import { OrdersModule } from './orders/orders.module';
import { InventoryModule } from './inventory/inventory.module';
import { PurchasesModule } from './purchases/purchases.module';
import { InvoicesModule } from './invoices/invoices.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { QuickServicesModule } from './quick-services/quick-services.module';
import { AccessoryOptionsModule } from './accessory-options/accessory-options.module';
import { BranchesModule } from './branches/branches.module';
import { NotificationInboxModule } from './notification-inbox/notification-inbox.module';
import { ReportsModule } from './reports/reports.module';
import { StorageModule } from './storage/storage.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuditModule } from './audit/audit.module';
import { RealtimeModule } from './realtime/realtime.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { BranchContextGuard } from './common/guards/branch-context.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 200 }]),
    PrismaModule,
    PosModule,
    PdfModule,
    ExcelModule,
    StorageModule,
    NotificationsModule,
    RealtimeModule,
    AuthModule,
    UsersModule,
    TenantsModule,
    ClientsModule,
    MotorcyclesModule,
    OrdersModule,
    InventoryModule,
    PurchasesModule,
    InvoicesModule,
    DashboardModule,
    AppointmentsModule,
    QuickServicesModule,
    AccessoryOptionsModule,
    BranchesModule,
    NotificationInboxModule,
    AuditModule,
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: BranchContextGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/pos/client';

// Segunda conexión, a una base de datos distinta (motopos, no taller_motos).
// No comparte nada con PrismaService: ni tablas, ni datos, ni transacciones.
// Confundir este servicio con el del taller compila igual (ambos son
// PrismaClient), pero falla en tiempo de ejecución porque cada uno solo
// conoce los modelos de su propia base.
@Injectable()
export class PosPrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PosPrismaService.name);

  constructor() {
    super({
      adapter: new PrismaPg({ connectionString: process.env.POS_DATABASE_URL }),
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connected to PostgreSQL (POS) via Prisma');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

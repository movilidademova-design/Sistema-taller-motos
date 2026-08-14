import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import { join } from 'path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  // Sin esto los logs retenidos por `bufferLogs` no se emiten nunca: la API
  // arrancaba (y fallaba) sin escribir una sola línea, ni el banner de Nest ni
  // el error de arranque. Es lo primero que hay que mirar cuando algo va mal.
  app.flushLogs();

  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(compression());
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','),
    credentials: true,
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  // La documentación publica el mapa completo de la API (cada endpoint, cada
  // parámetro, cada DTO). Útil en desarrollo, material de reconocimiento para
  // un atacante en producción.
  const docsEnabled = process.env.NODE_ENV !== 'production';
  if (docsEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Sistema Taller Bicimotos API')
      .setDescription(
        'API REST para la gestión multi-tenant de talleres de bicimotos y motos eléctricas',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT ?? 3001;
  await app.listen(port);

  console.log(
    `API escuchando en el puerto ${port} (prefijo /api)` +
      (docsEnabled ? ' — documentación en /api/docs' : ''),
  );
}

// Un fallo de arranque debe salir por el log y devolver un código distinto de
// cero, para que el gestor de procesos (Docker, PM2, systemd) lo vea como caído
// en vez de creer que terminó bien.
void bootstrap().catch((error) => {
  console.error('Fallo al arrancar la API:', error);
  process.exit(1);
});

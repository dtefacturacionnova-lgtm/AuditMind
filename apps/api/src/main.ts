import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // nginx (mismo VPS) agrega la IP real del cliente a X-Forwarded-For. Con 'loopback' Express confía
  // SOLO en ese salto: req.ip es la IP real y un valor falso metido por el cliente queda a la izquierda y
  // se ignora. Sin esto, req.ip sería siempre 127.0.0.1: el límite de intentos bloquearía a todos a la
  // vez y la evidencia de las firmas guardaría una IP inútil (docs/firma-externa-por-enlace.md §7).
  app.set('trust proxy', 'loopback');

  // Sin esto, Nest nunca dispara los hooks onModuleDestroy (ej. PrismaService)
  // al recibir SIGTERM/SIGINT — la conexión a Postgres queda huérfana en el
  // pooler de Supabase (session mode, tope de 15 clientes) cada vez que se
  // reinicia el proceso. Local y producción comparten ese mismo pool.
  app.enableShutdownHooks();

  // Security headers
  app.use(helmet());

  // CORS — permite el frontend web y el portal
  // En producción: APP_URL=https://auditmind.vercel.app,https://portal.auditmind.app
  const corsOrigins: (string | RegExp)[] = [
    'http://localhost:3000',
    'http://localhost:3002',
  ];
  if (process.env.APP_URL) {
    process.env.APP_URL.split(',').forEach(url => corsOrigins.push(url.trim()));
  }
  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // Validación global de DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Prefijo global de la API
  app.setGlobalPrefix('api/v1');

  // Swagger/OpenAPI: en producción NO se publica el mapa de endpoints y DTOs internos salvo SWAGGER_ENABLED=true
  // (revisión de seguridad F5b, 2026-10-19).
  const swagger = process.env.NODE_ENV !== 'production' || process.env.SWAGGER_ENABLED === 'true';
  if (swagger) {
    const config = new DocumentBuilder()
      .setTitle('AuditMind API')
      .setDescription('API de la plataforma de auditoría inteligente AuditMind')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  // Railway inyecta PORT automáticamente; PORT_API es el fallback local.
  // En el VPS API_HOST=127.0.0.1 (ecosystem): solo nginx llega a la API. En local escucha en todas las interfaces.
  const port = process.env.PORT ?? process.env.PORT_API ?? 3001;
  const host = process.env.API_HOST || '0.0.0.0';
  await app.listen(port, host);
  console.log(`🚀 AuditMind API corriendo en http://${host}:${port}/api/v1`);
  if (swagger) console.log(`📚 Swagger en http://localhost:${port}/api/docs`);
}

bootstrap();

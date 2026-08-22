import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

  // Swagger/OpenAPI
  const config = new DocumentBuilder()
    .setTitle('AuditMind API')
    .setDescription('API de la plataforma de auditoría inteligente AuditMind')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Railway inyecta PORT automáticamente; PORT_API es el fallback local
  const port = process.env.PORT ?? process.env.PORT_API ?? 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 AuditMind API corriendo en http://0.0.0.0:${port}/api/v1`);
  console.log(`📚 Swagger en http://localhost:${port}/api/docs`);
}

bootstrap();

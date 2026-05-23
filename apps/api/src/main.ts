import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // Disable the default NestJS logger body-parser so we can set the size limit ourselves
    bodyParser: false,
  });

  // Raw JSON body with 10 MB limit (accommodates import endpoint)
  app.use(json({ limit: '10mb' }));

  // Global API prefix — must be set before listen()
  app.setGlobalPrefix('api');

  // CORS: allow only the local Vite dev server
  app.enableCors({
    origin: 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });

  // Global Zod validation pipe — rejects any DTO that fails schema
  app.useGlobalPipes(new ZodValidationPipe());

  // Global exception filter — maps all errors to { error: { code, message, details? } }
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = parseInt(process.env['PORT'] ?? '3001', 10);
  // Security requirement: bind to loopback only — refuse connections from remote interfaces
  await app.listen(port, '127.0.0.1');

  console.log(`[api] TaskNote API listening on http://127.0.0.1:${port}/api`);
}

bootstrap().catch((err: unknown) => {
  console.error('[api] Fatal bootstrap error:', err);
  process.exit(1);
});

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { configureStaticServing } from './static-serving';
import type { INestApplication } from '@nestjs/common';

export interface ServerOptions {
  port?: number;
  host?: string;
}

export async function createServer(options: ServerOptions = {}): Promise<INestApplication> {
  const port = options.port ?? parseInt(process.env['PORT'] ?? '3001', 10);
  const host = options.host ?? '127.0.0.1';

  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  app.use(json({ limit: '10mb' }));

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });

  configureStaticServing(app);

  app.useGlobalPipes(new ZodValidationPipe());

  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(port, host);

  return app;
}

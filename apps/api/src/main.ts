import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { configureStaticServing } from './static-serving';

async function bootstrap(): Promise<void> {
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

  const port = parseInt(process.env['PORT'] ?? '3001', 10);
  
  await app.listen(port, '127.0.0.1');

  console.log(`[api] TaskNote API listening on http://127.0.0.1:${port}/api`);
}

bootstrap().catch((err: unknown) => {
  console.error('[api] Fatal bootstrap error:', err);
  process.exit(1);
});

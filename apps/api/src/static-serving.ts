import path from 'path';
import type { RequestHandler } from 'express';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

export function configureStaticServing(app: INestApplication): void {
  const staticDir = process.env['TASKNOTE_STATIC_DIR'];
  if (!staticDir) return;

  const absoluteDir = path.resolve(staticDir);
  const indexPath = path.join(absoluteDir, 'index.html');

  (app as NestExpressApplication).useStaticAssets(absoluteDir, { index: 'index.html' });

  // SPA fallback: send index.html for non-/api GET requests not resolved by static()
  const spaFallback: RequestHandler = (req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api')) return next();
    res.sendFile(indexPath);
  };

  app.use(spaFallback);
}

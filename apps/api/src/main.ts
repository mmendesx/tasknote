import { createServer } from './bootstrap';

createServer()
  .then((app) => {
    const address = app.getHttpServer().address() as { port: number };
    console.log(`[api] TaskNote API listening on http://127.0.0.1:${address.port}/api`);
  })
  .catch((err: unknown) => {
    console.error('[api] Fatal bootstrap error:', err);
    process.exit(1);
  });

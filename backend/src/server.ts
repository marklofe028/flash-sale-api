import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config';
import { saleRoutes } from './routes/sale';
import { getRedisClient, initSale, disconnectRedis } from './services/redis';

export async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  // CORS — allow React dev server in development
  await fastify.register(cors, {
    origin:
      process.env.NODE_ENV === 'production'
        ? process.env.FRONTEND_URL || false
        : true,
    methods: ['GET', 'POST'],
  });

  // Register all sale routes (no prefix needed for simplicity, but easy to add /api/v1)
  await fastify.register(saleRoutes);

  return fastify;
}

async function start() {
  const server = await buildServer();

  // Verify Redis is reachable before accepting traffic
  try {
    const redis = getRedisClient();
    await redis.connect();
    await redis.ping();
    server.log.info('Redis connected');
  } catch (err) {
    server.log.error({ err }, 'Could not connect to Redis — aborting startup');
    process.exit(1);
  }

  // Seed sale configuration into Redis
  await initSale({
    startTime: config.sale.startTime,
    endTime: config.sale.endTime,
    totalStock: config.sale.totalStock,
  });
  server.log.info(
    `Sale configured: stock=${config.sale.totalStock}, ` +
    `start=${config.sale.startTime}, end=${config.sale.endTime}`
  );

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    server.log.info(`Received ${signal}, shutting down gracefully`);
    await server.close();
    await disconnectRedis();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await server.listen({ port: config.port, host: config.host });
}

// Only start if this is the entry point (not when imported by tests)
if (require.main === module) {
  start();
}

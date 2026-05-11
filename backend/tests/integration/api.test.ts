/**
 * Integration tests — require a running Redis instance.
 * Start with: docker-compose up -d redis
 *
 * These tests flush the test Redis DB before each suite.
 * Uses a separate DB index (1) to avoid clobbering dev data.
 */
import { FastifyInstance } from 'fastify';
import supertest from 'supertest';
import { buildServer } from '../../src/server';
import { getRedisClient, initSale, disconnectRedis } from '../../src/services/redis';

// Use DB 1 for tests
process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';

let app: FastifyInstance;
let redis: ReturnType<typeof getRedisClient>;

const ACTIVE_SALE: Parameters<typeof initSale>[0] = {
  startTime: new Date(Date.now() - 60_000).toISOString(),   // started 1 min ago
  endTime: new Date(Date.now() + 3_600_000).toISOString(),  // ends in 1 hour
  totalStock: 10,
};

async function resetSale(stock = 10): Promise<void> {
  await redis.flushdb();
  await initSale({ ...ACTIVE_SALE, totalStock: stock });
}

beforeAll(async () => {
  app = await buildServer();
  await app.ready();
  redis = getRedisClient();
  await redis.select(1); // test DB
});

afterAll(async () => {
  await redis.flushdb();
  await app.close();
  await disconnectRedis();
});

// ─── GET /sale/status ────────────────────────────────────────────────────────

describe('GET /sale/status', () => {
  beforeEach(() => resetSale());

  it('returns 200 with active status', async () => {
    const res = await supertest(app.server).get('/sale/status');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
    expect(res.body.remainingStock).toBe(10);
    expect(res.body.totalStock).toBe(10);
  });

  it('returns upcoming when sale is in the future', async () => {
    await redis.flushdb();
    await initSale({
      startTime: new Date(Date.now() + 60_000).toISOString(),
      endTime: new Date(Date.now() + 3_600_000).toISOString(),
      totalStock: 10,
    });
    const res = await supertest(app.server).get('/sale/status');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('upcoming');
  });
});

// ─── POST /sale/buy ──────────────────────────────────────────────────────────

describe('POST /sale/buy', () => {
  beforeEach(() => resetSale());

  it('returns 200 on successful first purchase', async () => {
    const res = await supertest(app.server)
      .post('/sale/buy')
      .send({ userId: 'user-1' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.remainingStock).toBe(9);
  });

  it('returns 409 on duplicate purchase attempt by same user', async () => {
    await supertest(app.server).post('/sale/buy').send({ userId: 'user-dup' });
    const res = await supertest(app.server).post('/sale/buy').send({ userId: 'user-dup' });
    expect(res.status).toBe(409);
    expect(res.body.reason).toBe('already_purchased');
  });

  it('returns 410 when stock is exhausted', async () => {
    await resetSale(1);
    await supertest(app.server).post('/sale/buy').send({ userId: 'user-a' });
    const res = await supertest(app.server).post('/sale/buy').send({ userId: 'user-b' });
    expect(res.status).toBe(410);
    expect(res.body.reason).toBe('out_of_stock');
  });

  it('returns 400 when sale has ended', async () => {
    await redis.flushdb();
    await initSale({
      startTime: new Date(Date.now() - 7_200_000).toISOString(),
      endTime: new Date(Date.now() - 3_600_000).toISOString(),
      totalStock: 10,
    });
    const res = await supertest(app.server)
      .post('/sale/buy')
      .send({ userId: 'user-late' });
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('sale_not_active');
  });

  it('rejects missing userId with 400', async () => {
    const res = await supertest(app.server).post('/sale/buy').send({});
    expect(res.status).toBe(400);
  });

  it('does not oversell: 20 concurrent buyers for 5 items', async () => {
    await resetSale(5);

    const buyers = Array.from({ length: 20 }, (_, i) =>
      supertest(app.server)
        .post('/sale/buy')
        .send({ userId: `concurrent-user-${i}` })
    );

    const results = await Promise.all(buyers);
    const successes = results.filter((r) => r.status === 200);
    const failures = results.filter((r) => r.status === 410);

    // Exactly 5 should succeed
    expect(successes).toHaveLength(5);
    // Remaining 15 should be out-of-stock
    expect(failures).toHaveLength(15);

    // Verify Redis stock is exactly 0, not negative
    const finalStock = await redis.get('sale:stock');
    expect(parseInt(finalStock!, 10)).toBe(0);
  });
});

// ─── GET /sale/order/:userId ─────────────────────────────────────────────────

describe('GET /sale/order/:userId', () => {
  beforeEach(() => resetSale());

  it('returns hasPurchased: false for new user', async () => {
    const res = await supertest(app.server).get('/sale/order/unknown-user');
    expect(res.status).toBe(200);
    expect(res.body.hasPurchased).toBe(false);
  });

  it('returns hasPurchased: true with timestamp after purchase', async () => {
    await supertest(app.server).post('/sale/buy').send({ userId: 'check-user' });
    const res = await supertest(app.server).get('/sale/order/check-user');
    expect(res.status).toBe(200);
    expect(res.body.hasPurchased).toBe(true);
    expect(res.body.purchasedAt).toBeDefined();
  });
});

// ─── GET /health ─────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200', async () => {
    const res = await supertest(app.server).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

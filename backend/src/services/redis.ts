import Redis from 'ioredis';
import { config, REDIS_KEYS } from '../config';

// Singleton Redis client
let client: Redis | null = null;

export function getRedisClient(): Redis {
  if (!client) {
    client = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });

    client.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
    });
  }
  return client;
}

export async function disconnectRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}

// ─── Sale config ────────────────────────────────────────────────────────────

export interface SaleConfig {
  startTime: string;
  endTime: string;
  totalStock: number;
}

export async function initSale(saleConfig: SaleConfig): Promise<void> {
  const redis = getRedisClient();
  const pipeline = redis.pipeline();

  pipeline.hset(REDIS_KEYS.SALE_CONFIG, {
    startTime: saleConfig.startTime,
    endTime: saleConfig.endTime,
    totalStock: saleConfig.totalStock.toString(),
  });

  // Only set stock if it doesn't already exist — prevents reset on restart
  pipeline.setnx(REDIS_KEYS.STOCK, saleConfig.totalStock.toString());

  await pipeline.exec();
}

export async function getSaleConfig(): Promise<SaleConfig | null> {
  const redis = getRedisClient();
  const data = await redis.hgetall(REDIS_KEYS.SALE_CONFIG);
  if (!data || !data.startTime) return null;
  return {
    startTime: data.startTime,
    endTime: data.endTime,
    totalStock: parseInt(data.totalStock, 10),
  };
}

export async function getCurrentStock(): Promise<number> {
  const redis = getRedisClient();
  const val = await redis.get(REDIS_KEYS.STOCK);
  return val !== null ? parseInt(val, 10) : 0;
}

// ─── Purchase ────────────────────────────────────────────────────────────────

export type PurchaseResult =
  | { success: true; remainingStock: number }
  | { success: false; reason: 'already_purchased' | 'out_of_stock' | 'sale_not_active' };

export function getSaleStatus(saleConfig: SaleConfig): 'upcoming' | 'active' | 'ended' {
  const now = Date.now();
  const start = new Date(saleConfig.startTime).getTime();
  const end = new Date(saleConfig.endTime).getTime();
  if (now < start) return 'upcoming';
  if (now > end) return 'ended';
  return 'active';
}

/**
 * Atomic purchase attempt using Redis SETNX + DECR.
 *
 * Design decision: We use SETNX to guard one-per-user, then DECR on stock.
 * If stock goes negative after DECR, we INCR it back (rollback) and delete
 * the user key so they can retry if stock is restocked. This ensures we
 * never oversell even under thousands of concurrent requests.
 */
export async function attemptPurchase(
  userId: string,
  saleConfig: SaleConfig
): Promise<PurchaseResult> {
  const status = getSaleStatus(saleConfig);
  if (status !== 'active') {
    return { success: false, reason: 'sale_not_active' };
  }

  const redis = getRedisClient();
  const purchaseKey = REDIS_KEYS.purchase(userId);

  // Step 1: Try to claim the user slot (NX = only set if not exists)
  const claimed = await redis.setnx(purchaseKey, Date.now().toString());
  if (claimed === 0) {
    // User has already purchased or is mid-flight
    return { success: false, reason: 'already_purchased' };
  }

  // Step 2: Atomically decrement stock
  const remaining = await redis.decr(REDIS_KEYS.STOCK);

  if (remaining < 0) {
    // Stock exhausted — rollback both operations
    await redis.pipeline()
      .incr(REDIS_KEYS.STOCK)   // restore the unit we took
      .del(purchaseKey)          // free the user slot
      .exec();
    return { success: false, reason: 'out_of_stock' };
  }

  // Purchase confirmed
  return { success: true, remainingStock: remaining };
}

export async function getUserPurchase(userId: string): Promise<string | null> {
  const redis = getRedisClient();
  return redis.get(REDIS_KEYS.purchase(userId));
}

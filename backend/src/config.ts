import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  sale: {
    // ISO strings — override via env for testing
    startTime: process.env.SALE_START || new Date(Date.now() + 5_000).toISOString(),
    endTime: process.env.SALE_END || new Date(Date.now() + 3_600_000).toISOString(),
    totalStock: parseInt(process.env.SALE_STOCK || '100', 10),
  },
} as const;

export const REDIS_KEYS = {
  SALE_CONFIG: 'sale:config',
  STOCK: 'sale:stock',
  purchase: (userId: string) => `purchase:${userId}`,
} as const;

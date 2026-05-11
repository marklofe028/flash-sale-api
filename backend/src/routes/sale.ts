import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  getSaleConfig,
  getCurrentStock,
  getSaleStatus,
  attemptPurchase,
  getUserPurchase,
} from '../services/redis';

interface BuyBody {
  userId: string;
}

interface OrderParams {
  userId: string;
}

export async function saleRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /sale/status
   * Returns current sale state: upcoming | active | ended, plus remaining stock.
   */
  fastify.get('/sale/status', async (_req: FastifyRequest, reply: FastifyReply) => {
    const saleConfig = await getSaleConfig();
    if (!saleConfig) {
      return reply.status(503).send({ error: 'Sale not configured' });
    }

    const status = getSaleStatus(saleConfig);
    const remainingStock = await getCurrentStock();

    return reply.send({
      status,
      startTime: saleConfig.startTime,
      endTime: saleConfig.endTime,
      totalStock: saleConfig.totalStock,
      remainingStock: Math.max(0, remainingStock),
    });
  });

  /**
   * POST /sale/buy
   * Body: { userId: string }
   * Attempts to purchase one unit for the given user.
   */
  fastify.post<{ Body: BuyBody }>(
    '/sale/buy',
    {
      schema: {
        body: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string', minLength: 1, maxLength: 128 },
          },
        },
      },
    },
    async (req: FastifyRequest<{ Body: BuyBody }>, reply: FastifyReply) => {
      const { userId } = req.body;

      const saleConfig = await getSaleConfig();
      if (!saleConfig) {
        return reply.status(503).send({ error: 'Sale not configured' });
      }

      const result = await attemptPurchase(userId, saleConfig);

      if (result.success) {
        return reply.status(200).send({
          success: true,
          message: 'Purchase successful! You secured one item.',
          remainingStock: result.remainingStock,
        });
      }

      const statusMap: Record<string, number> = {
        already_purchased: 409,
        out_of_stock: 410,
        sale_not_active: 400,
      };

      const messageMap: Record<string, string> = {
        already_purchased: 'You have already purchased an item in this sale.',
        out_of_stock: 'Sorry, the item is sold out.',
        sale_not_active: 'The sale is not currently active.',
      };

      return reply.status(statusMap[result.reason]).send({
        success: false,
        reason: result.reason,
        message: messageMap[result.reason],
      });
    }
  );

  /**
   * GET /sale/order/:userId
   * Check if a user has already purchased.
   */
  fastify.get<{ Params: OrderParams }>(
    '/sale/order/:userId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string', minLength: 1, maxLength: 128 },
          },
        },
      },
    },
    async (req: FastifyRequest<{ Params: OrderParams }>, reply: FastifyReply) => {
      const { userId } = req.params;
      const purchasedAt = await getUserPurchase(userId);

      if (!purchasedAt) {
        return reply.send({ hasPurchased: false });
      }

      return reply.send({
        hasPurchased: true,
        purchasedAt: new Date(parseInt(purchasedAt, 10)).toISOString(),
      });
    }
  );

  /**
   * GET /health
   * Liveness probe for load balancers / orchestrators.
   */
  fastify.get('/health', async (_req, reply) => {
    return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  });
}

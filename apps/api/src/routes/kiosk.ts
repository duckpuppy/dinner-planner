import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getKioskWeek } from '../services/kiosk.js';

const querySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (use YYYY-MM-DD)')
    .refine((d) => !Number.isNaN(Date.parse(d)), 'Invalid date')
    .optional(),
});

export async function kioskRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/kiosk/week?date=YYYY-MM-DD
   * Read-only week view for an always-on display. Authenticated ONLY by a
   * display key (Authorization: Bearer dpk_... or ?key=). Never creates data.
   * `today` is the server-local date and is informational; the display's own
   * clock drives the midnight rollover.
   */
  fastify.get(
    '/api/kiosk/week',
    {
      preHandler: [fastify.authenticateDisplayKey],
      // Enforced only when @fastify/rate-limit is registered (not in tests)
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Invalid date format',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const week = await getKioskWeek(request.displayLink!.familyId, parsed.data.date);
      reply.header('Cache-Control', 'no-store');
      return reply.send(week);
    }
  );
}

import type { FastifyInstance } from 'fastify';
import { createPrepTaskSchema, updatePrepTaskSchema } from '@dinner-planner/shared';
import {
  getPrepTasksForEntry,
  createPrepTask,
  updatePrepTask,
  deletePrepTask,
} from '../services/prepTasks.js';

export async function prepTasksRoutes(fastify: FastifyInstance) {
  // GET /api/entries/:entryId/prep-tasks
  fastify.get(
    '/api/entries/:entryId/prep-tasks',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { entryId } = request.params as { entryId: string };
      const prepTasks = await getPrepTasksForEntry(entryId);
      return reply.send({ prepTasks });
    }
  );

  // POST /api/entries/:entryId/prep-tasks
  fastify.post(
    '/api/entries/:entryId/prep-tasks',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { entryId } = request.params as { entryId: string };
      const parsed = createPrepTaskSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
      }
      const prepTask = await createPrepTask(entryId, parsed.data);
      return reply.status(201).send(prepTask);
    }
  );

  // PATCH /api/prep-tasks/:id
  fastify.patch(
    '/api/prep-tasks/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updatePrepTaskSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
      }
      const prepTask = await updatePrepTask(id, parsed.data);
      if (!prepTask) return reply.status(404).send({ error: 'Prep task not found' });
      return reply.send(prepTask);
    }
  );

  // DELETE /api/prep-tasks/:id
  fastify.delete(
    '/api/prep-tasks/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const deleted = await deletePrepTask(id);
      if (!deleted) return reply.status(404).send({ error: 'Prep task not found' });
      return reply.status(204).send();
    }
  );
}

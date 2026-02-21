import type { FastifyInstance } from 'fastify';
import { createDishNoteSchema } from '@dinner-planner/shared';
import { getDishNotes, createDishNote, deleteDishNote } from '../services/dishNotes.js';

export async function dishNotesRoutes(fastify: FastifyInstance) {
  // GET /api/dishes/:dishId/notes
  fastify.get(
    '/api/dishes/:dishId/notes',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { dishId } = request.params as { dishId: string };
      const notes = await getDishNotes(dishId);
      return reply.send({ notes });
    }
  );

  // POST /api/dishes/:dishId/notes
  fastify.post(
    '/api/dishes/:dishId/notes',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { dishId } = request.params as { dishId: string };
      const parsed = createDishNoteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
      }
      const user = request.user as { userId: string };
      const note = await createDishNote(dishId, parsed.data.note, user.userId);
      if (!note) return reply.status(404).send({ error: 'Dish not found' });
      return reply.status(201).send(note);
    }
  );

  // DELETE /api/dish-notes/:id
  fastify.delete(
    '/api/dish-notes/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const deleted = await deleteDishNote(id);
      if (!deleted) return reply.status(404).send({ error: 'Note not found' });
      return reply.status(204).send();
    }
  );
}

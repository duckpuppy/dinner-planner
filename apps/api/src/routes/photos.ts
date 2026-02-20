import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as photosService from '../services/photos.js';

export async function photosRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/preparations/:id/photos
   */
  fastify.get(
    '/api/preparations/:id/photos',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      const photoList = await photosService.getPhotosForPreparation(id);
      return { photos: photoList };
    }
  );

  /**
   * POST /api/preparations/:id/photos
   * Multipart form upload — field name: "photo"
   */
  fastify.post(
    '/api/preparations/:id/photos',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      const photo = await photosService.uploadPhoto(id, request.user.userId, data);
      return reply.status(201).send({ photo });
    }
  );

  /**
   * DELETE /api/photos/:id
   */
  fastify.delete(
    '/api/photos/:id',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const isAdmin = request.user.role === 'admin';
      await photosService.deletePhoto(id, request.user.userId, isAdmin);
      return reply.status(200).send({ success: true });
    }
  );
}

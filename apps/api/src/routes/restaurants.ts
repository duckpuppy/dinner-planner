import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createRestaurantSchema,
  updateRestaurantSchema,
  restaurantQuerySchema,
  createRestaurantDishSchema,
  updateRestaurantDishSchema,
  createRestaurantDishRatingSchema,
  updateRestaurantDishRatingSchema,
} from '@dinner-planner/shared';
import * as restaurantsService from '../services/restaurants.js';
import * as restaurantDishesService from '../services/restaurantDishes.js';

export async function restaurantsRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/restaurants
   * List restaurants with optional filtering and pagination
   */
  fastify.get(
    '/api/restaurants',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parseResult = restaurantQuerySchema.safeParse(request.query);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const result = await restaurantsService.listRestaurants(parseResult.data);
      return reply.send(result);
    }
  );

  /**
   * POST /api/restaurants
   * Create a new restaurant
   */
  fastify.post(
    '/api/restaurants',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parseResult = createRestaurantSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const userId = (request.user as { userId: string }).userId;
      const restaurant = await restaurantsService.createRestaurant(parseResult.data, userId);
      return reply.status(201).send(restaurant);
    }
  );

  /**
   * GET /api/restaurants/:id
   * Get a restaurant by ID
   */
  fastify.get(
    '/api/restaurants/:id',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const restaurant = await restaurantsService.getRestaurantById(id);
      if (!restaurant) {
        return reply.status(404).send({ error: 'Restaurant not found' });
      }
      return reply.send(restaurant);
    }
  );

  /**
   * PUT /api/restaurants/:id
   * Update a restaurant
   */
  fastify.put(
    '/api/restaurants/:id',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parseResult = updateRestaurantSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const restaurant = await restaurantsService.updateRestaurant(id, parseResult.data);
      if (!restaurant) {
        return reply.status(404).send({ error: 'Restaurant not found' });
      }
      return reply.send(restaurant);
    }
  );

  /**
   * DELETE /api/restaurants/:id
   * Delete a restaurant
   */
  fastify.delete(
    '/api/restaurants/:id',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const result = await restaurantsService.deleteRestaurant(id);
      if (!result.success) {
        return reply.status(404).send({ error: result.error ?? 'Restaurant not found' });
      }
      return reply.status(204).send();
    }
  );

  /**
   * GET /api/restaurants/:id/dishes
   * List dishes at a restaurant
   */
  fastify.get(
    '/api/restaurants/:id/dishes',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const dishes = await restaurantDishesService.listDishesByRestaurant(id);
      return reply.send({ dishes });
    }
  );

  /**
   * POST /api/restaurants/:id/dishes
   * Add a dish to a restaurant
   */
  fastify.post(
    '/api/restaurants/:id/dishes',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parseResult = createRestaurantDishSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const dish = await restaurantDishesService.createRestaurantDish(id, parseResult.data);
      return reply.status(201).send(dish);
    }
  );

  /**
   * PUT /api/restaurants/:restaurantId/dishes/:dishId
   * Update a restaurant dish
   */
  fastify.put(
    '/api/restaurants/:restaurantId/dishes/:dishId',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { dishId } = request.params as { restaurantId: string; dishId: string };
      const parseResult = updateRestaurantDishSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const dish = await restaurantDishesService.updateRestaurantDish(dishId, parseResult.data);
      if (!dish) {
        return reply.status(404).send({ error: 'Dish not found' });
      }
      return reply.send(dish);
    }
  );

  /**
   * DELETE /api/restaurants/:restaurantId/dishes/:dishId
   * Delete a restaurant dish
   */
  fastify.delete(
    '/api/restaurants/:restaurantId/dishes/:dishId',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { dishId } = request.params as { restaurantId: string; dishId: string };
      const result = await restaurantDishesService.deleteRestaurantDish(dishId);
      if (!result.success) {
        return reply.status(404).send({ error: result.error ?? 'Dish not found' });
      }
      return reply.status(204).send();
    }
  );

  /**
   * GET /api/restaurants/:restaurantId/dishes/:dishId/ratings
   * List ratings for a dish
   */
  fastify.get(
    '/api/restaurants/:restaurantId/dishes/:dishId/ratings',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { dishId } = request.params as { restaurantId: string; dishId: string };
      const ratings = await restaurantDishesService.getDishRatings(dishId);
      return reply.send({ ratings });
    }
  );

  /**
   * POST /api/restaurants/:restaurantId/dishes/:dishId/ratings
   * Add or upsert a rating for a dish (one per user per dish)
   */
  fastify.post(
    '/api/restaurants/:restaurantId/dishes/:dishId/ratings',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { dishId } = request.params as { restaurantId: string; dishId: string };
      const parseResult = createRestaurantDishRatingSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const userId = (request.user as { userId: string }).userId;
      const rating = await restaurantDishesService.addDishRating(dishId, userId, parseResult.data);
      return reply.status(201).send(rating);
    }
  );

  /**
   * PUT /api/restaurants/:restaurantId/dishes/:dishId/ratings/:ratingId
   * Update an existing rating
   */
  fastify.put(
    '/api/restaurants/:restaurantId/dishes/:dishId/ratings/:ratingId',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { ratingId } = request.params as {
        restaurantId: string;
        dishId: string;
        ratingId: string;
      };
      const parseResult = updateRestaurantDishRatingSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const rating = await restaurantDishesService.updateDishRating(ratingId, parseResult.data);
      if (!rating) {
        return reply.status(404).send({ error: 'Rating not found' });
      }
      return reply.send(rating);
    }
  );
}

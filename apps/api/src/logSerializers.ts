import type { FastifyRequest } from 'fastify';

/**
 * Replace the value of sensitive query parameters (the kiosk `?key=` display
 * key) so credentials never reach request logs.
 */
const SENSITIVE_PARAMS = /([?&]key=)[^&#]*/gi;

export function redactUrl(url: string): string {
  return url.replace(SENSITIVE_PARAMS, '$1[REDACTED]');
}

/**
 * Pino serializers for the Fastify logger. Mirrors Fastify's default `req`
 * serializer but with the URL redacted.
 */
export const loggerSerializers = {
  req(request: FastifyRequest) {
    return {
      method: request.method,
      url: redactUrl(request.url),
      host: request.host,
      remoteAddress: request.ip,
      remotePort: request.socket?.remotePort,
    };
  },
};

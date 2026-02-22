/**
 * Security header tests — verifies the production CSP is emitted correctly
 * so regressions (e.g. losing connect-src 'self') are caught before release.
 */
import { describe, it, expect, afterAll } from 'vitest';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import { healthRoutes } from '../routes/health.js';
import { productionCspDirectives } from '../csp.js';

const app = Fastify();

await app.register(helmet, {
  contentSecurityPolicy: { directives: productionCspDirectives },
});
await app.register(healthRoutes);
await app.ready();

afterAll(() => app.close());

describe('Content-Security-Policy header (production)', () => {
  let csp: string;

  it('is present on API responses', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    csp = res.headers['content-security-policy'] as string;
    expect(csp).toBeTruthy();
  });

  it("includes connect-src 'self'", () => {
    expect(csp).toContain("connect-src 'self'");
  });

  it("includes default-src 'self'", () => {
    expect(csp).toContain("default-src 'self'");
  });

  it("includes object-src 'none'", () => {
    expect(csp).toContain("object-src 'none'");
  });

  it("includes frame-ancestors 'none'", () => {
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("includes worker-src 'self' for PWA service worker", () => {
    expect(csp).toContain("worker-src 'self'");
  });

  it("includes manifest-src 'self' for PWA manifest", () => {
    expect(csp).toContain("manifest-src 'self'");
  });
});

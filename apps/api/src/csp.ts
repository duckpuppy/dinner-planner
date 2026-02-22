export const productionCspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", 'data:', 'blob:'],
  connectSrc: ["'self'"],
  fontSrc: ["'self'", 'data:'],
  objectSrc: ["'none'"],
  frameAncestors: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  workerSrc: ["'self'"],
  manifestSrc: ["'self'"],
} as const;

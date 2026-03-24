export type RegisteredQueryHandler = (payload: unknown) => unknown;

export type TypedQueryHandler<Payload = never, Result = unknown> = (
  payload: Payload
) => Promise<Result> | Result;

function adaptQueryHandler<Payload, Result>(
  handler: TypedQueryHandler<Payload, Result>
): RegisteredQueryHandler {
  return (payload: unknown) => handler(payload as Payload);
}

export function registerQueryHandlers<Handlers extends Record<string, TypedQueryHandler>>(
  modulePrefix: string,
  handlers: Handlers
): void {
  for (const [queryName, handler] of Object.entries(handlers)) {
    CONFIG.queries[`${modulePrefix}.${queryName}`] = adaptQueryHandler(handler);
  }
}

export function unregisterQueryHandlers(modulePrefix: string): void {
  const keysToRemove = Object.keys(CONFIG.queries).filter(key => key.startsWith(modulePrefix));

  for (const key of keysToRemove) {
    delete CONFIG.queries[key];
  }
}

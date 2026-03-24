export type QueryHandler = (payload: unknown) => Promise<unknown> | unknown;

export function registerQueryHandlers(
  modulePrefix: string,
  handlers: Record<string, QueryHandler>
): void {
  for (const [queryName, handler] of Object.entries(handlers)) {
    CONFIG.queries[`${modulePrefix}.${queryName}`] = handler;
  }
}

export function unregisterQueryHandlers(modulePrefix: string): void {
  const keysToRemove = Object.keys(CONFIG.queries).filter(key => key.startsWith(modulePrefix));

  for (const key of keysToRemove) {
    delete CONFIG.queries[key];
  }
}
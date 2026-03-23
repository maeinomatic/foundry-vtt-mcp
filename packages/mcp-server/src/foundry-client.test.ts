import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Logger } from './logger.js';
import { FoundryClient } from './foundry-client.js';

const connectorState = {
  isConnected: false,
  waitForConnectionResult: false,
  queryResult: { ok: true } as unknown,
  queryCalls: [] as Array<{ method: string; data: unknown }>,
  waitCalls: [] as number[],
};

const connectorMock = {
  start: vi.fn(() => Promise.resolve(undefined)),
  stop: vi.fn(() => Promise.resolve(undefined)),
  query: vi.fn((method: string, data?: unknown) => {
    connectorState.queryCalls.push({ method, data });
    return Promise.resolve(connectorState.queryResult);
  }),
  sendToFoundry: vi.fn(),
  broadcastMessage: vi.fn(),
  getConnectionInfo: vi.fn(() => ({
    started: true,
    connected: connectorState.isConnected,
    connectionType: null,
    readyState: 'CLOSED',
    config: { port: 31415, namespace: '/maeinomatic-foundry-mcp' },
  })),
  getConnectionType: vi.fn(() => null),
  isConnected: vi.fn(() => connectorState.isConnected),
  waitForConnection: vi.fn((timeoutMs: number) => {
    connectorState.waitCalls.push(timeoutMs);
    if (connectorState.waitForConnectionResult) {
      connectorState.isConnected = true;
    }
    return Promise.resolve(connectorState.waitForConnectionResult);
  }),
};

vi.mock('./foundry-connector.js', () => ({
  FoundryConnector: vi.fn(() => connectorMock),
}));

function createLoggerStub(): Logger {
  const logger = {
    child: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger as unknown as Logger;
}

describe('FoundryClient', () => {
  beforeEach(() => {
    connectorState.isConnected = false;
    connectorState.waitForConnectionResult = false;
    connectorState.queryResult = { ok: true };
    connectorState.queryCalls = [];
    connectorState.waitCalls = [];
    vi.clearAllMocks();
  });

  it('waits briefly for reconnect before querying when initially disconnected', async () => {
    const client = new FoundryClient(
      {
        host: 'localhost',
        port: 31415,
        namespace: '/maeinomatic-foundry-mcp',
        reconnectAttempts: 5,
        reconnectDelay: 1000,
        connectionTimeout: 10000,
        connectionType: 'auto',
        protocol: 'ws',
        remoteMode: false,
        rejectUnauthorized: true,
        webrtc: { stunServers: [] },
      },
      createLoggerStub()
    );

    connectorState.waitForConnectionResult = true;

    await expect(client.query('maeinomatic-foundry-mcp.getWorldInfo')).resolves.toEqual({
      ok: true,
    });

    expect(connectorMock.waitForConnection).toHaveBeenCalledWith(5000);
    expect(connectorMock.query).toHaveBeenCalledWith(
      'maeinomatic-foundry-mcp.getWorldInfo',
      undefined
    );
  });

  it('fails with the usual message when reconnect grace expires', async () => {
    const client = new FoundryClient(
      {
        host: 'localhost',
        port: 31415,
        namespace: '/maeinomatic-foundry-mcp',
        reconnectAttempts: 5,
        reconnectDelay: 1000,
        connectionTimeout: 10000,
        connectionType: 'auto',
        protocol: 'ws',
        remoteMode: false,
        rejectUnauthorized: true,
        webrtc: { stunServers: [] },
      },
      createLoggerStub()
    );

    connectorState.waitForConnectionResult = false;

    await expect(client.query('maeinomatic-foundry-mcp.getWorldInfo')).rejects.toThrow(
      'Foundry VTT module not connected. Please ensure Foundry is running and the MCP Bridge module is enabled.'
    );

    expect(connectorMock.waitForConnection).toHaveBeenCalledWith(5000);
    expect(connectorMock.query).not.toHaveBeenCalled();
  });
});

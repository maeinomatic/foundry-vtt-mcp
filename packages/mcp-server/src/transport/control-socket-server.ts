import * as net from 'net';

import type { FoundryMcpToolResult, FoundryRpcMessage, UnknownRecord } from '../foundry-types.js';
import { Logger } from '../logger.js';
import { dispatchMcpToolCall, type MpcToolRouterDependencies } from './mcp-tool-router.js';

export interface ControlSocketServerOptions {
  host: string;
  port: number;
  logger: Logger;
  allTools: UnknownRecord[];
  toolDependencies: MpcToolRouterDependencies;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

export async function startControlSocketServer(
  options: ControlSocketServerOptions
): Promise<net.Server> {
  const { host, port, logger, allTools, toolDependencies } = options;

  const server = net.createServer((socket): void => {
    socket.setEncoding('utf8');

    let buffer = '';

    socket.on('data', (chunk: string): void => {
      void (async (): Promise<void> => {
        buffer += chunk;

        let idx: number;

        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);

          if (!line) continue;

          try {
            const msg = JSON.parse(line) as FoundryRpcMessage;
            const msgId = asString(msg.id, '');
            const msgMethod = asString(msg.method, '');
            const msgParams = msg.params ?? {};

            if (msgMethod === 'ping') {
              socket.write(`${JSON.stringify({ id: msgId, result: { ok: true } })}\n`);
              continue;
            }

            if (msgMethod === 'list_tools') {
              socket.write(`${JSON.stringify({ id: msgId, result: { tools: allTools } })}\n`);
              continue;
            }

            if (msgMethod === 'call_tool') {
              const name = asString(msgParams.name, '');
              const args = msgParams.args;

              try {
                const result = await dispatchMcpToolCall(name, args, toolDependencies);
                const payload: FoundryMcpToolResult = {
                  content: [
                    {
                      type: 'text',
                      text: typeof result === 'string' ? result : JSON.stringify(result),
                    },
                  ],
                };

                socket.write(`${JSON.stringify({ id: msgId, result: payload })}\n`);
              } catch (error: unknown) {
                const errorMessage =
                  error instanceof Error ? error.message : 'Unknown error occurred';

                socket.write(
                  `${JSON.stringify({
                    id: msgId,
                    result: {
                      content: [{ type: 'text', text: `Error: ${errorMessage}` }],
                      isError: true,
                    } as FoundryMcpToolResult,
                  })}\n`
                );
              }

              continue;
            }

            socket.write(
              `${JSON.stringify({ id: msgId, error: { message: 'Unknown method' } })}\n`
            );
          } catch (error: unknown) {
            try {
              const errorText = error instanceof Error ? error.message : 'Bad request';
              socket.write(`${JSON.stringify({ error: { message: errorText } })}\n`);
            } catch {}
          }
        }
      })();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(port, host, () => {
      logger.info(`Backend control channel listening on ${host}:${port}`);
      resolve();
    });

    server.on('error', reject);
  });

  return server;
}

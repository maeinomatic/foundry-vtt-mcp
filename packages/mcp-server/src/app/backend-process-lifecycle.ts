import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { UnknownRecord } from '../foundry-types.js';

const LOCK_FILE = path.join(os.tmpdir(), 'foundry-mcp-backend.lock');

let lockFd: number | null = null;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' ? (value as UnknownRecord) : {};
}

export function acquireBackendLock(): boolean {
  try {
    try {
      lockFd = fs.openSync(LOCK_FILE, 'wx');
    } catch (err: unknown) {
      const errRecord = asRecord(err);
      if (errRecord.code === 'EEXIST') {
        try {
          const lockData = fs.readFileSync(LOCK_FILE, 'utf8');
          const lockPid = parseInt(lockData.trim(), 10);

          try {
            process.kill(lockPid, 0);
            return false;
          } catch {
            console.error(`Removing stale backend lock for PID ${lockPid}`);

            try {
              fs.unlinkSync(LOCK_FILE);
            } catch {}

            lockFd = fs.openSync(LOCK_FILE, 'wx');
          }
        } catch (readErr) {
          console.error('Corrupt backend lock file, removing:', readErr);

          try {
            fs.unlinkSync(LOCK_FILE);
          } catch {}

          lockFd = fs.openSync(LOCK_FILE, 'wx');
        }
      } else {
        console.error('Failed to open backend lock file:', err);
        return false;
      }
    }

    if (lockFd === null) {
      return false;
    }

    fs.writeFileSync(lockFd, String(process.pid));

    try {
      fs.fsyncSync(lockFd);
    } catch {}

    console.error(`Acquired backend lock with PID ${process.pid}`);
    return true;
  } catch (error) {
    console.error('Failed to acquire backend lock:', error);
    return false;
  }
}

export function releaseBackendLock(): void {
  try {
    if (lockFd !== null) {
      try {
        fs.closeSync(lockFd);
      } catch {}
      lockFd = null;
    }

    if (fs.existsSync(LOCK_FILE)) {
      try {
        fs.unlinkSync(LOCK_FILE);
      } catch {}
    }
  } catch (error) {
    console.error('Failed to release backend lock:', error);
  }
}

export function registerBackendShutdownHandlers(onShutdown: () => void): void {
  process.on('SIGINT', () => {
    onShutdown();
    releaseBackendLock();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    onShutdown();
    releaseBackendLock();
    process.exit(0);
  });
}

export async function runBackendMain(startBackend: () => Promise<void>): Promise<void> {
  const hasLock = acquireBackendLock();

  if (!hasLock) {
    await new Promise(() => {});
    return;
  }

  process.on('exit', releaseBackendLock);

  try {
    await startBackend();
  } catch (error: unknown) {
    const errorText = error instanceof Error ? error.message : String(error);
    console.error('Failed to start backend:', errorText);
    releaseBackendLock();
    process.exit(1);
  }
}

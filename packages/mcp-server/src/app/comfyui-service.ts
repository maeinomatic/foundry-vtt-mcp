import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { spawn, type ChildProcess } from 'child_process';

import { Logger } from '../logger.js';

export interface ComfyUIServiceOptions {
  logger: Logger;
  port?: number;
  host?: string;
}

export class ComfyUIService {
  private logger: Logger;
  private port: number;
  private host: string;
  private process: ChildProcess | null = null;
  private status: 'stopped' | 'starting' | 'running' | 'error' = 'stopped';

  constructor(options: ComfyUIServiceOptions) {
    this.logger = options.logger.child({ component: 'ComfyUIService' });
    this.port = options.port ?? 31411;
    this.host = options.host ?? '127.0.0.1';
  }

  async startService(): Promise<Record<string, unknown>> {
    if (this.status === 'running') {
      return { status: 'already_running', message: 'ComfyUI service is already running' };
    }

    if (this.status === 'starting') {
      return { status: 'starting', message: 'ComfyUI service start already in progress' };
    }

    try {
      this.status = 'starting';

      this.logger.info('Starting ComfyUI service...');

      const comfyUIPath = this.findComfyUIPath();
      this.logger.info('ComfyUI found', { path: comfyUIPath });
      this.logger.info('Starting ComfyUI process', { path: path.join(comfyUIPath, 'main.py') });

      const pythonExe = this.getBundledPythonPath();
      this.logger.info('Using bundled Python', { pythonPath: pythonExe });

      this.process = spawn(
        pythonExe,
        [
          'main.py',
          '--port',
          String(this.port),
          '--listen',
          this.host,
          '--disable-auto-launch',
          '--dont-print-server',
        ],
        {
          cwd: comfyUIPath,
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: false,
          windowsHide: true,
        }
      );

      this.process.on('spawn', () => {
        this.logger.info('ComfyUI process spawned successfully');
      });

      this.process.on('error', error => {
        this.logger.error('ComfyUI process error', { error: error.message });
        this.status = 'error';
      });

      this.process.on('exit', (code, signal) => {
        this.logger.info('ComfyUI process exited', { code, signal });
        this.status = 'stopped';
        this.process = null;
      });

      this.process.stdout?.on('data', (data: unknown) => {
        this.logger.debug('ComfyUI stdout', { data: String(data).trim() });
      });

      this.process.stderr?.on('data', (data: unknown) => {
        this.logger.debug('ComfyUI stderr', { data: String(data).trim() });
      });

      await this.waitForReady();

      this.status = 'running';

      this.logger.info('ComfyUI service started successfully', {
        pid: this.process.pid,
        status: this.status,
      });

      return {
        status: 'running',
        message: 'ComfyUI service started successfully',
        pid: this.process.pid,
      };
    } catch (error: unknown) {
      this.logger.error('ComfyUI service start failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      this.status = 'error';

      if (this.process) {
        this.process.kill();
        this.process = null;
      }

      return {
        status: 'error',
        message: `Failed to start ComfyUI service: ${this.getErrorMessage(error)}`,
      };
    }
  }

  async stopService(): Promise<Record<string, unknown>> {
    if (this.status === 'stopped') {
      return { status: 'already_stopped', message: 'ComfyUI service is already stopped' };
    }

    try {
      this.logger.info('Stopping ComfyUI service...');

      if (this.process) {
        this.process.kill('SIGTERM');

        await new Promise(resolve => setTimeout(resolve, 5000));

        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
      }

      this.status = 'stopped';
      this.process = null;

      this.logger.info('ComfyUI service stopped successfully');

      return { status: 'stopped', message: 'ComfyUI service stopped successfully' };
    } catch (error: unknown) {
      this.logger.error('ComfyUI service stop failed', {
        error: this.getErrorMessage(error),
      });

      return {
        status: 'error',
        message: `Failed to stop ComfyUI service: ${this.getErrorMessage(error)}`,
      };
    }
  }

  async checkStatus(): Promise<Record<string, unknown>> {
    try {
      const response = await fetch(`http://${this.host}:${this.port}/system_stats`, {
        signal: AbortSignal.timeout(5000),
      });

      this.status = response.ok ? 'running' : 'error';
    } catch {
      this.status = 'stopped';
    }

    return {
      status: this.status,
      message: this.getStatusMessage(this.status),
      pid: this.process?.pid ?? null,
    };
  }

  private getBundledPythonPath(): string {
    let installDir = path.join(os.homedir(), 'AppData', 'Local', 'MaeinomaticFoundryMCPServer');

    const currentDir = process.cwd();
    const execDir = path.dirname(process.execPath);

    if (
      currentDir.includes('MaeinomaticFoundryMCPServer') ||
      execDir.includes('MaeinomaticFoundryMCPServer')
    ) {
      const foundryMcpIndex = currentDir.indexOf('MaeinomaticFoundryMCPServer');
      if (foundryMcpIndex !== -1) {
        installDir = currentDir.substring(
          0,
          foundryMcpIndex + 'MaeinomaticFoundryMCPServer'.length
        );
      } else {
        const foundryMcpExecIndex = execDir.indexOf('MaeinomaticFoundryMCPServer');
        if (foundryMcpExecIndex !== -1) {
          installDir = execDir.substring(
            0,
            foundryMcpExecIndex + 'MaeinomaticFoundryMCPServer'.length
          );
        }
      }
    }

    const nestedComfyUIPythonPath = path.join(
      installDir,
      'ComfyUI',
      'ComfyUI',
      'python_embeded',
      'python.exe'
    );
    if (fs.existsSync(nestedComfyUIPythonPath)) {
      return nestedComfyUIPythonPath;
    }

    const portablePythonPath = path.join(installDir, 'ComfyUI', 'python_embeded', 'python.exe');
    if (fs.existsSync(portablePythonPath)) {
      return portablePythonPath;
    }

    const bundledPythonPath = path.join(installDir, 'ComfyUI-env', 'Scripts', 'python.exe');
    if (fs.existsSync(bundledPythonPath)) {
      return bundledPythonPath;
    }

    const fallbackPaths = [
      path.join(
        os.homedir(),
        'AppData',
        'Local',
        'MaeinomaticFoundryMCPServer',
        'ComfyUI',
        'ComfyUI',
        'python_embeded',
        'python.exe'
      ),
      path.join(
        os.homedir(),
        'AppData',
        'Local',
        'MaeinomaticFoundryMCPServer',
        'ComfyUI-headless',
        'ComfyUI',
        'python_embeded',
        'python.exe'
      ),
      path.join(
        os.homedir(),
        'AppData',
        'Local',
        'MaeinomaticFoundryMCPServer',
        'ComfyUI',
        'python_embeded',
        'python.exe'
      ),
      path.join(
        os.homedir(),
        'AppData',
        'Local',
        'MaeinomaticFoundryMCPServer',
        'ComfyUI-headless',
        'python_embeded',
        'python.exe'
      ),
      path.join(
        os.homedir(),
        'AppData',
        'Local',
        'MaeinomaticFoundryMCPServer',
        'ComfyUI-env',
        'Scripts',
        'python.exe'
      ),
      path.join(process.cwd(), '..', '..', 'ComfyUI-env', 'Scripts', 'python.exe'),
      path.join(__dirname, '..', '..', '..', 'ComfyUI-env', 'Scripts', 'python.exe'),
      path.join(
        os.homedir(),
        'AppData',
        'Local',
        'MaeinomaticFoundryMCPServer',
        'Python',
        'python.exe'
      ),
    ];

    for (const fallbackPath of fallbackPaths) {
      if (fs.existsSync(fallbackPath)) {
        return fallbackPath;
      }
    }

    console.error('Bundled Python not found, falling back to system Python');
    return 'python';
  }

  private findComfyUIPath(): string {
    const nestedComfyUIPath = path.join(
      os.homedir(),
      'AppData',
      'Local',
      'MaeinomaticFoundryMCPServer',
      'ComfyUI',
      'ComfyUI'
    );

    if (fs.existsSync(path.join(nestedComfyUIPath, 'main.py'))) {
      return nestedComfyUIPath;
    }

    const nestedHeadlessPath = path.join(
      os.homedir(),
      'AppData',
      'Local',
      'MaeinomaticFoundryMCPServer',
      'ComfyUI-headless',
      'ComfyUI'
    );

    if (fs.existsSync(path.join(nestedHeadlessPath, 'main.py'))) {
      return nestedHeadlessPath;
    }

    const flatPath = path.join(
      os.homedir(),
      'AppData',
      'Local',
      'MaeinomaticFoundryMCPServer',
      'ComfyUI'
    );

    if (fs.existsSync(path.join(flatPath, 'main.py'))) {
      return flatPath;
    }

    const legacyFlatPath = path.join(
      os.homedir(),
      'AppData',
      'Local',
      'MaeinomaticFoundryMCPServer',
      'ComfyUI-headless'
    );

    if (fs.existsSync(path.join(legacyFlatPath, 'main.py'))) {
      return legacyFlatPath;
    }

    throw new Error('ComfyUI installation not found');
  }

  private async waitForReady(timeoutMs: number = 60000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await fetch(`http://${this.host}:${this.port}/system_stats`, {
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          return;
        }
      } catch {
        // Still starting up, continue polling.
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error('ComfyUI failed to start within timeout');
  }

  private getStatusMessage(status: string): string {
    const statusMessages = {
      stopped: 'ComfyUI service is not running',
      starting: 'ComfyUI service is starting...',
      running: 'ComfyUI service is running',
      error: 'ComfyUI service encountered an error',
    };

    return statusMessages[status as keyof typeof statusMessages] ?? 'Unknown status';
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

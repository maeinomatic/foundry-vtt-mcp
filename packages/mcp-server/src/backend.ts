import { runBackendMain } from './app/backend-process-lifecycle.js';
import { startBackendServices } from './app/backend-startup.js';

async function startBackendEntry(): Promise<void> {
	await startBackendServices();
}

void runBackendMain(startBackendEntry);

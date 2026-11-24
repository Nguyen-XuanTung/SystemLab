/// <reference lib="webworker" />
import { WorkerSessionRunner } from './runner';
import type { WorkerCommand, WorkerResponse } from './protocol';

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

const runner = new WorkerSessionRunner((response: WorkerResponse) => {
  ctx.postMessage(response);
});

ctx.onmessage = (event: MessageEvent<WorkerCommand>) => {
  runner.handleCommand(event.data);
};

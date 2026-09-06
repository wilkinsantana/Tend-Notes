import { afterEach, beforeEach, expect, test } from 'bun:test';
import { WorkerTaskProcessor } from '../src/taskProcessor';
import type { MarkdownTask } from '../src/tasks';

type Listener = ((event: Event) => void) | null;

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: Listener = null;
  readonly messages: unknown[] = [];
  terminated = false;

  constructor(readonly url: URL, readonly options: WorkerOptions) {
    FakeWorker.instances.push(this);
  }

  postMessage(message: unknown) { this.messages.push(message); }
  terminate() { this.terminated = true; }
  respond(data: unknown) { this.onmessage?.({ data } as MessageEvent<unknown>); }
}

const realWorker = globalThis.Worker;

beforeEach(() => {
  Object.defineProperty(globalThis, 'Worker', { configurable: true, writable: true, value: FakeWorker });
});
afterEach(() => {
  Object.defineProperty(globalThis, 'Worker', { configurable: true, writable: true, value: realWorker });
  FakeWorker.instances.length = 0;
});

test('uses a module worker URL and matches concurrent replies by request ID', async () => {
  const processor = new WorkerTaskProcessor();
  const worker = FakeWorker.instances[0];
  expect(worker.options).toEqual({ type: 'module', name: 'tend-notes-task-parser' });
  expect(worker.url.pathname.endsWith('/task-worker.js')).toBe(true);

  const first = processor.extract('- [ ] first\n');
  const task: MarkdownTask = { key: '1:3', offset: 3, line: 1, text: 'first', checked: false };
  const second = processor.setChecked('- [ ] first\n', task, true);
  const [extractRequest, setRequest] = worker.messages as Array<{ requestId: number; operation: string }>;
  expect(extractRequest.operation).toBe('extract');
  expect(setRequest.operation).toBe('setChecked');

  worker.respond({ requestId: setRequest.requestId, ok: true, result: '- [x] first\n' });
  worker.respond({ requestId: extractRequest.requestId, ok: true, result: [task] });
  expect(await second).toBe('- [x] first\n');
  expect(await first).toEqual([task]);
  processor.dispose();
});

test('operation errors reject only their matching request', async () => {
  const processor = new WorkerTaskProcessor();
  const worker = FakeWorker.instances[0];
  const failed = processor.extract('bad');
  const healthy = processor.extract('- [ ] okay');
  const [failedRequest, healthyRequest] = worker.messages as Array<{ requestId: number }>;
  worker.respond({ requestId: failedRequest.requestId, ok: false, error: 'Parser rejected the request.' });
  worker.respond({ requestId: healthyRequest.requestId, ok: true, result: [] });
  await expect(failed).rejects.toThrow('Parser rejected the request.');
  await expect(healthy).resolves.toEqual([]);
  expect(worker.terminated).toBe(false);
  processor.dispose();
});

test('dispose terminates the worker and rejects every outstanding request', async () => {
  const processor = new WorkerTaskProcessor();
  const worker = FakeWorker.instances[0];
  const first = processor.extract('one');
  const second = processor.extract('two');
  processor.dispose();
  expect(worker.terminated).toBe(true);
  await expect(first).rejects.toThrow(/Close and reopen ToDo/);
  await expect(second).rejects.toThrow(/Close and reopen ToDo/);
  await expect(processor.extract('three')).rejects.toThrow(/Close and reopen ToDo/);
});

test('a worker error is terminal while a newly constructed processor starts fresh', async () => {
  const processor = new WorkerTaskProcessor();
  const worker = FakeWorker.instances[0];
  const pending = processor.extract('one');
  worker.onerror?.({ message: 'module load failed', preventDefault() {} } as ErrorEvent);
  await expect(pending).rejects.toThrow('module load failed');
  await expect(processor.extract('two')).rejects.toThrow('module load failed');
  expect(worker.terminated).toBe(true);

  const reopened = new WorkerTaskProcessor();
  const replacement = FakeWorker.instances[1];
  const request = reopened.extract('- [ ] recovered');
  const [{ requestId }] = replacement.messages as Array<{ requestId: number }>;
  replacement.respond({ requestId, ok: true, result: [] });
  await expect(request).resolves.toEqual([]);
  reopened.dispose();
});

test('an invalid successful response terminates the worker and rejects other work', async () => {
  const processor = new WorkerTaskProcessor();
  const worker = FakeWorker.instances[0];
  const malformed = processor.extract('one');
  const waiting = processor.extract('two');
  const [request] = worker.messages as Array<{ requestId: number }>;
  worker.respond({ requestId: request.requestId, ok: true, result: 'wrong result type' });
  await expect(malformed).rejects.toThrow(/invalid response/);
  await expect(waiting).rejects.toThrow(/invalid response/);
  expect(worker.terminated).toBe(true);
});

import type { MarkdownTask } from './tasks';

export interface TaskProcessor {
  extract(content: string): Promise<MarkdownTask[]>;
  setChecked(content: string, task: MarkdownTask, checked: boolean): Promise<string>;
  dispose(): void;
}

type TaskRequestInput =
  | { operation: 'extract'; content: string }
  | { operation: 'setChecked'; content: string; task: MarkdownTask; checked: boolean };

interface PendingRequest {
  operation: TaskRequestInput['operation'];
  resolve(value: MarkdownTask[] | string): void;
  reject(error: Error): void;
}

const closedError = () => new Error('Task processing stopped. Close and reopen ToDo to retry.');
const validTask = (value: unknown): value is MarkdownTask => {
  if (!value || typeof value !== 'object') return false;
  const task = value as Partial<MarkdownTask>;
  return typeof task.key === 'string'
    && Number.isSafeInteger(task.offset)
    && Number.isSafeInteger(task.line)
    && typeof task.text === 'string'
    && typeof task.checked === 'boolean';
};

/** Runs the existing Markdown task parser in a dedicated, same-origin module
 * worker. A failed worker is terminal for this Notes instance so parser work is
 * never moved back onto the UI thread implicitly. */
export class WorkerTaskProcessor implements TaskProcessor {
  private readonly worker: Worker;
  private readonly pending = new Map<number, PendingRequest>();
  private nextRequestId = 1;
  private failure: Error | null = null;

  constructor() {
    // Vite serves the TypeScript module directly during development. Production
    // emits task-worker.js beside index.js so the host's `script-src 'self'`
    // policy can load it without blob:, data:, or eval-based workers.
    const sourcePath = import.meta.env?.DEV === true ? './taskWorker.ts' : './task-worker.js';
    this.worker = new Worker(new URL(sourcePath, import.meta.url), {
      type: 'module',
      name: 'tend-notes-task-parser',
    });
    this.worker.onmessage = (event: MessageEvent<unknown>) => this.receive(event.data);
    this.worker.onerror = (event) => {
      event.preventDefault();
      this.fail(event.message ? new Error(`Task worker failed: ${event.message}`) : closedError());
    };
    this.worker.onmessageerror = () => this.fail(new Error('Task worker returned an unreadable response. Close and reopen ToDo to retry.'));
  }

  extract(content: string): Promise<MarkdownTask[]> {
    return this.request<MarkdownTask[]>({ operation: 'extract', content });
  }

  setChecked(content: string, task: MarkdownTask, checked: boolean): Promise<string> {
    return this.request<string>({ operation: 'setChecked', content, task, checked });
  }

  dispose(): void {
    this.fail(closedError());
  }

  private request<T extends MarkdownTask[] | string>(request: TaskRequestInput): Promise<T> {
    if (this.failure) return Promise.reject(this.failure);
    const requestId = this.nextRequestId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, {
        operation: request.operation,
        resolve: value => resolve(value as T),
        reject,
      });
      try {
        this.worker.postMessage({ requestId, ...request });
      } catch (error) {
        this.fail(error instanceof Error ? error : closedError());
      }
    });
  }

  private receive(value: unknown): void {
    if (!value || typeof value !== 'object') {
      this.fail(new Error('Task worker returned an invalid response. Close and reopen ToDo to retry.'));
      return;
    }
    const response = value as Record<string, unknown>;
    if (!Number.isSafeInteger(response.requestId) || typeof response.ok !== 'boolean') {
      this.fail(new Error('Task worker returned an invalid response. Close and reopen ToDo to retry.'));
      return;
    }
    const pending = this.pending.get(response.requestId as number);
    if (!pending) return;
    if (!response.ok) {
      this.pending.delete(response.requestId as number);
      pending.reject(new Error(typeof response.error === 'string' ? response.error : 'Task processing failed.'));
      return;
    }
    const validResult = pending.operation === 'extract'
      ? Array.isArray(response.result) && response.result.every(validTask)
      : typeof response.result === 'string';
    if (!validResult) {
      this.fail(new Error('Task worker returned an invalid response. Close and reopen ToDo to retry.'));
      return;
    }
    this.pending.delete(response.requestId as number);
    pending.resolve(response.result as MarkdownTask[] | string);
  }

  private fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    this.worker.terminate();
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

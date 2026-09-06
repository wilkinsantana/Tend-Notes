/// <reference lib="webworker" />

import { extractTasks, setTaskChecked, type MarkdownTask } from './tasks';

type TaskRequest =
  | { requestId: number; operation: 'extract'; content: string }
  | { requestId: number; operation: 'setChecked'; content: string; task: MarkdownTask; checked: boolean };

type TaskResponse =
  | { requestId: number; ok: true; result: MarkdownTask[] | string }
  | { requestId: number; ok: false; error: string };

const worker = self as unknown as DedicatedWorkerGlobalScope;

function isTask(value: unknown): value is MarkdownTask {
  if (!value || typeof value !== 'object') return false;
  const task = value as Partial<MarkdownTask>;
  return typeof task.key === 'string'
    && Number.isSafeInteger(task.offset)
    && Number.isSafeInteger(task.line)
    && typeof task.text === 'string'
    && typeof task.checked === 'boolean';
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Task processing failed.';
}

worker.onmessage = (event: MessageEvent<unknown>) => {
  const value = event.data;
  if (!value || typeof value !== 'object') return;
  const request = value as Partial<TaskRequest>;
  if (!Number.isSafeInteger(request.requestId)) return;

  let response: TaskResponse;
  try {
    if (request.operation === 'extract' && typeof request.content === 'string') {
      response = { requestId: request.requestId as number, ok: true, result: extractTasks(request.content) };
    } else if (request.operation === 'setChecked' && typeof request.content === 'string'
      && isTask(request.task) && typeof request.checked === 'boolean') {
      response = {
        requestId: request.requestId as number,
        ok: true,
        result: setTaskChecked(request.content, request.task, request.checked),
      };
    } else {
      response = { requestId: request.requestId as number, ok: false, error: 'Unsupported task operation.' };
    }
  } catch (error) {
    response = { requestId: request.requestId as number, ok: false, error: errorText(error) };
  }
  worker.postMessage(response);
};

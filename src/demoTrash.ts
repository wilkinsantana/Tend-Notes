/** Development-only recovery fixture. Never packaged in the Notes extension. */
import type { Document, Trash, TrashItem, TrashOperation } from './host';
export function demoTrash(get: () => Document[], put: (documents: Document[]) => void, controls: {trashLoseResponse: boolean; trashBeforeSend: boolean}): Trash {
  const key = 'tend-notes:demo-trash';
  type RecoveryRecord = {item: TrashItem; document: Document};
  const read = (): {items: RecoveryRecord[]; operations: Record<string, TrashOperation>} => JSON.parse(localStorage.getItem(key) ?? '{"items":[],"operations":{}}');
  const write = (value: ReturnType<typeof read>) => localStorage.setItem(key, JSON.stringify(value));
  const lost = (result: TrashOperation) => { if (controls.trashLoseResponse) { controls.trashLoseResponse = false; throw new Error('Sample connection interrupted after the server completed this action.'); } return result; };
  function operation(id: string) {
    const result = read().operations[id];
    if (!result) throw Object.assign(new Error('Recovery operation not found.'), {status: 404});
    return result;
  }
  function mutate(action: 'restore' | 'purge', id: string, input: {generation: number; operationId: string; name?: string}) {
    if (controls.trashBeforeSend) { controls.trashBeforeSend = false; throw new Error('Sample request did not reach the server.'); }
    const state = read();
    if (state.operations[input.operationId]) return state.operations[input.operationId];
    const row = state.items.find(row => row.item.id === id);
    if (!row || row.item.generation !== input.generation) throw Object.assign(new Error('Refresh Trash before trying again.'), {status: 409});
    const name = input.name ?? row.document.name;
    const collision = action === 'restore' && get().some(doc => doc.libraryId === row.document.libraryId && doc.name === name);
    const now = Math.floor(Date.now() / 1000);
    const restored = {...row.document, name};
    const result: TrashOperation = {operationId: input.operationId, action, state: collision ? 'failed' : 'confirmed', trashId: id, submittedAt: now, updatedAt: now, result: collision ? null : action === 'restore' ? restored : null, error: collision ? {code: 'name_collision', message: 'A note with that name already exists. Choose another name.'} : null};
    if (!collision) {
      if (action === 'restore') put([...get(), restored]);
      state.items = state.items.filter(row => row.item.id !== id);
    }
    state.operations[input.operationId] = result; write(state); return lost(result);
  }
  return {
    version: 1,
    async list(cursor) { const items = read().items.map(row => row.item); const offset = Number(cursor ?? 0); return {items: items.slice(offset, offset + 50), nextCursor: items.length > offset + 50 ? String(offset + 50) : null, retention: 'until_permanently_deleted'}; },
    async move(input) {
      const state = read();
      if (state.operations[input.operationId]) return state.operations[input.operationId];
      const document = get().find(doc => doc.id === input.documentId);
      if (!document || document.revision !== input.revision) throw Object.assign(new Error('The note changed. Refresh before trying again.'), {status: 409});
      const now = Math.floor(Date.now()/1000); const id = crypto.randomUUID().replaceAll('-', '');
      state.items.unshift({document, item: {id, generation: 1, libraryId: document.libraryId, libraryName: document.libraryId === 'personal' ? 'Personal notes' : 'Work notes', name: document.name, revision: document.revision, size: document.size, deletedAt: now, state: 'retained', activeOperationId: null}});
      const result: TrashOperation = {operationId: input.operationId, action: 'move', state: 'confirmed', trashId: id, submittedAt: now, updatedAt: now, result: null, error: null};
      state.operations[input.operationId] = result;
      put(get().filter(doc => doc.id !== document.id)); write(state); return lost(result);
    },
    async status(id) { return operation(id); },
    async retry(id) { return operation(id); },
    async restore(id, input) { return mutate('restore', id, input); },
    async purge(id, input) { return mutate('purge', id, input); },
  };
}

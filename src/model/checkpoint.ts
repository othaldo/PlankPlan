import type { Project } from './types';

export interface Checkpoint { project: Project; label: string; date: string }
let database: Promise<IDBDatabase> | undefined;
function open() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('plankplan.safety.v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('checkpoint');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => { database = undefined; reject(new Error('Der Sicherungsspeicher ist blockiert.')); };
  });
}
export async function readCheckpoint(): Promise<Checkpoint | null> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction('checkpoint').objectStore('checkpoint').get('latest');
    request.onsuccess = () => resolve(request.result ?? null); request.onerror = () => reject(request.error);
  });
}
export async function ensureCheckpoint(project: Project): Promise<Checkpoint> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('checkpoint', 'readwrite'), store = tx.objectStore('checkpoint');
    const request = store.get('latest');
    let checkpoint: Checkpoint;
    request.onsuccess = () => {
      checkpoint = request.result ?? { project, label: 'Stand beim ersten Start mit Sicherungsfunktion', date: new Date().toISOString() };
      if (!request.result) store.put(checkpoint, 'latest');
    };
    tx.oncomplete = () => resolve(checkpoint); tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error);
  });
}
export async function saveCheckpoint(project: Project, label: string): Promise<Checkpoint> {
  const checkpoint = { project, label, date: new Date().toISOString() }, db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('checkpoint', 'readwrite'); tx.objectStore('checkpoint').put(checkpoint, 'latest');
    tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error);
  });
  return checkpoint;
}

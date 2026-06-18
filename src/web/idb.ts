/**
 * 极简 IndexedDB key-value（无依赖），替代 Electron 的 storage.ts。
 * 库名 casino，单 object store kv。值为任意可结构化克隆的对象。
 */

const DB_NAME = 'casino'
const STORE = 'kv'

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = run(t.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
  )
}

export function idbGet<T = unknown>(key: string): Promise<T | null> {
  return tx<T>('readonly', (s) => s.get(key) as IDBRequest<T>).then((v) => v ?? null)
}

export function idbSet(key: string, value: unknown): Promise<void> {
  // 结构化克隆要求纯数据：先 JSON round-trip，去掉 proxy/函数，行为对齐文件 JSON 存储
  const plain = JSON.parse(JSON.stringify(value))
  return tx('readwrite', (s) => s.put(plain, key) as IDBRequest<IDBValidKey>).then(() => undefined)
}

export function idbDel(key: string): Promise<void> {
  return tx('readwrite', (s) => s.delete(key) as unknown as IDBRequest<undefined>).then(() => undefined)
}

export function idbKeys(): Promise<string[]> {
  return tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys() as IDBRequest<IDBValidKey[]>).then(
    (ks) => ks.map(String)
  )
}

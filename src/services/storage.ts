const DATABASE_NAME = 'shotai-local'
const DATABASE_VERSION = 3
const WORKSPACE_STORE_NAME = 'workspace'
const KNOWLEDGE_STORE_NAME = 'knowledge'
const IMAGE_HISTORY_STORE_NAME = 'image-history'
const WORKSPACE_KEY = 'primary'
const KNOWLEDGE_KEY = 'primary'
const IMAGE_HISTORY_KEY = 'primary'

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.addEventListener('upgradeneeded', () => {
      const database = request.result
      if (!database.objectStoreNames.contains(WORKSPACE_STORE_NAME)) {
        database.createObjectStore(WORKSPACE_STORE_NAME)
      }
      if (!database.objectStoreNames.contains(KNOWLEDGE_STORE_NAME)) {
        database.createObjectStore(KNOWLEDGE_STORE_NAME)
      }
      if (!database.objectStoreNames.contains(IMAGE_HISTORY_STORE_NAME)) {
        database.createObjectStore(IMAGE_HISTORY_STORE_NAME)
      }
    })
    request.addEventListener('success', () => resolve(request.result))
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('无法打开本地数据库'))
    })
  })
}

function runTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
) {
  return openDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(storeName, mode)
        const request = operation(transaction.objectStore(storeName))

        request.addEventListener('success', () => resolve(request.result))
        request.addEventListener('error', () => {
          reject(request.error ?? new Error('本地数据库操作失败'))
        })
        transaction.addEventListener('complete', () => database.close())
        transaction.addEventListener('abort', () => {
          database.close()
          reject(transaction.error ?? new Error('本地数据库事务已中止'))
        })
      }),
  )
}

export function loadWorkspaceState<T>() {
  return runTransaction<T | undefined>(WORKSPACE_STORE_NAME, 'readonly', (store) =>
    store.get(WORKSPACE_KEY),
  )
}

export function saveWorkspaceState<T>(state: T) {
  return runTransaction<IDBValidKey>(WORKSPACE_STORE_NAME, 'readwrite', (store) =>
    store.put(state, WORKSPACE_KEY),
  ).then(() => undefined)
}

export function loadKnowledgeState<T>() {
  return runTransaction<T | undefined>(KNOWLEDGE_STORE_NAME, 'readonly', (store) =>
    store.get(KNOWLEDGE_KEY),
  )
}

export function saveKnowledgeState<T>(state: T) {
  return runTransaction<IDBValidKey>(KNOWLEDGE_STORE_NAME, 'readwrite', (store) =>
    store.put(state, KNOWLEDGE_KEY),
  ).then(() => undefined)
}

export function clearWorkspaceState() {
  return runTransaction<undefined>(WORKSPACE_STORE_NAME, 'readwrite', (store) =>
    store.delete(WORKSPACE_KEY),
  ).then(() => undefined)
}

export function clearKnowledgeState() {
  return runTransaction<undefined>(KNOWLEDGE_STORE_NAME, 'readwrite', (store) =>
    store.delete(KNOWLEDGE_KEY),
  ).then(() => undefined)
}

export function loadImageHistory<T>() {
  return runTransaction<T | undefined>(
    IMAGE_HISTORY_STORE_NAME,
    'readonly',
    (store) => store.get(IMAGE_HISTORY_KEY),
  )
}

export function saveImageHistory<T>(history: T) {
  return runTransaction<IDBValidKey>(
    IMAGE_HISTORY_STORE_NAME,
    'readwrite',
    (store) => store.put(history, IMAGE_HISTORY_KEY),
  ).then(() => undefined)
}

export function clearImageHistory() {
  return runTransaction<undefined>(
    IMAGE_HISTORY_STORE_NAME,
    'readwrite',
    (store) => store.delete(IMAGE_HISTORY_KEY),
  ).then(() => undefined)
}

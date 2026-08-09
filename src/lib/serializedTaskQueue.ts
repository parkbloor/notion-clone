const taskQueues = new Map<string, Promise<unknown>>()

/** 같은 key의 비동기 작업을 앞 작업 완료 후 순서대로 실행한다. */
export async function runSerializedTask<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = taskQueues.get(key) ?? Promise.resolve()
  const current = previous.then(operation)
  taskQueues.set(key, current)

  try {
    return await current
  } finally {
    if (taskQueues.get(key) === current) taskQueues.delete(key)
  }
}

import type { WorkerReceivedMessage, WorkerSendMessage } from './worker-chatRequest'

type Handler = (data: WorkerSendMessage) => void

let worker: Worker

export function useChatWorker() {
  const handlers: Handler[] = []

  if (!worker) {
    worker = new Worker(new URL('./worker-chatRequest', import.meta.url))
  }

  worker.addEventListener('message', onMessage)

  if (getCurrentScope()) {
    onScopeDispose(() => {
      worker.removeEventListener('message', onMessage)
    })
  }

  function onMessage(e: MessageEvent<WorkerSendMessage>) {
    handlers.forEach(h => h(e.data))
  }

  function sendMessage(data: WorkerReceivedMessage) {
    worker.postMessage(JSON.parse(JSON.stringify(data)))
  }

  function onReceivedMessage(handler: Handler) {
    handlers.push(handler)
  }

  return { sendMessage, onReceivedMessage }
}

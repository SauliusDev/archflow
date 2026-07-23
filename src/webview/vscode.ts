import { parseHostToWebviewMessage, type HostToWebviewMessage, type WebviewToHostMessage } from '../shared/protocol'

// acquireVsCodeApi() must be called exactly once per webview lifetime
const vscodeApi = acquireVsCodeApi()

export function sendToHost(msg: WebviewToHostMessage): void {
  vscodeApi.postMessage(msg)
}

export function onHostMessage(handler: (msg: HostToWebviewMessage) => void): () => void {
  const listener = (event: MessageEvent<unknown>) => {
    const parsed = parseHostToWebviewMessage(event.data)
    if (parsed.ok) {
      handler(parsed.value)
      return
    }
    sendToHost({
      type: 'LOG',
      payload: { level: 'warn', message: `Rejected invalid host message: ${parsed.message}` },
    })
  }
  window.addEventListener('message', listener)
  return () => window.removeEventListener('message', listener)
}

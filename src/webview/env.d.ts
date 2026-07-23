// Ambient declaration for VS Code webview global injected by VS Code into webview HTML.
// Full types available via @types/vscode-webview package.
declare function acquireVsCodeApi<T = unknown>(): {
  postMessage(message: unknown): void
  getState(): T | undefined
  setState(state: T): void
}

declare module '*.png' {
  const src: string
  export default src
}

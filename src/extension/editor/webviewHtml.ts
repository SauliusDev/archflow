import * as crypto from 'crypto'
import * as fs from 'fs'

export interface HtmlWebviewPort {
  readonly cspSource: string
  asWebviewUri(uri: string): unknown
}

export interface WebviewHtmlOptions {
  readonly webview: HtmlWebviewPort
  readonly webviewOutPath: string
  readonly serverUrl?: string
  readonly readFile?: (path: string) => string
  readonly createNonce?: () => string
  readonly log?: (message: string) => void
}

export function getWebviewHtml(options: WebviewHtmlOptions): string {
  if (options.serverUrl) return buildDevHtml(options.serverUrl)
  return buildProductionHtml(options)
}

function buildDevHtml(serverUrl: string): string {
  const csp = [
    "default-src 'none'",
    `script-src 'unsafe-inline' 'unsafe-eval' ${serverUrl}`,
    `style-src 'unsafe-inline' ${serverUrl} https://fonts.googleapis.com`,
    'font-src https://fonts.gstatic.com',
    `frame-src ${serverUrl}`,
    `connect-src ${serverUrl} ws: wss:`,
    `img-src ${serverUrl} vscode-resource: data: blob:`,
  ].join('; ')
  // Do not use @tomjs/vite-plugin-vscode's iframe bridge here. Recent VS Code
  // releases can leave that bridge blank, while Vite's own client works directly
  // in a webview.
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>Flowforge</title>
</head>
<body>
  <div id="root"></div>
  <script type="module">
    import { injectIntoGlobalHook } from "${serverUrl}/@react-refresh"
    injectIntoGlobalHook(window)
    window.$RefreshReg$ = () => {}
    window.$RefreshSig$ = () => (type) => type
  </script>
  <script type="module" src="${serverUrl}/@vite/client"></script>
  <script type="module" src="${serverUrl}/src/webview/main.tsx"></script>
</body>
</html>`
}

function buildProductionHtml(options: WebviewHtmlOptions): string {
  const nonce = (options.createNonce ?? (() => crypto.randomUUID().replace(/-/g, '')))()
  let html: string
  try {
    html = (options.readFile ?? ((path: string) => fs.readFileSync(path, 'utf-8')))(`${options.webviewOutPath}/index.html`)
  } catch (error: unknown) {
    options.log?.(`[ERROR] Failed to read webview index.html: ${String(error)}`)
    return '<!DOCTYPE html><html><body><p>Flowforge: webview not built. Run <code>npm run build</code>.</p></body></html>'
  }
  const assetUri = (assetPath: string) => String(options.webview.asWebviewUri(`${options.webviewOutPath}/${assetPath.slice(1)}`))
  html = html.replace(/ src="(\/[^\"]+)"/g, (_match, assetPath: string) => ` src="${assetUri(assetPath)}"`)
  html = html.replace(/ href="(\/[^\"]+)"/g, (_match, assetPath: string) => ` href="${assetUri(assetPath)}"`)
  html = html.replace(/<script(?=[ >])/g, `<script nonce="${nonce}"`)
  const csp = [
    "default-src 'none'",
    `img-src ${options.webview.cspSource} data:`,
    `style-src ${options.webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com`,
    'font-src https://fonts.gstatic.com',
    `script-src 'nonce-${nonce}'`,
  ].join('; ')
  return html.replace('<head>', `<head>\n  <meta http-equiv="Content-Security-Policy" content="${csp}">`)
}

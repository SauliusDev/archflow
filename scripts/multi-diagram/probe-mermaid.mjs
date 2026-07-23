import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const fixtureRoot = path.join(repoRoot, 'test/fixtures/multi-diagram')
const manifest = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'manifest.json'), 'utf8'))

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.SVGElement = dom.window.SVGElement
  globalThis.HTMLCanvasElement = dom.window.HTMLCanvasElement
  globalThis.screen = { width: 1440, height: 900, availWidth: 1440, availHeight: 900 }
  globalThis.SVGElement.prototype.getBBox = function getBBox() {
    const text = this.textContent ?? ''
    return { x: 0, y: 0, width: Math.max(24, text.length * 8), height: 20 }
  }
  globalThis.SVGElement.prototype.getComputedTextLength = function getComputedTextLength() {
    return Math.max(24, (this.textContent ?? '').length * 8)
  }
  globalThis.HTMLCanvasElement.prototype.getContext = function getContext() {
    const context = { font: '', measureText: text => ({ width: String(text).length * 8 }) }
    return new Proxy(context, {
      get(target, property) {
        if (property in target) return target[property]
        return () => undefined
      },
    })
  }
}

function matches(actual, expected) {
  return actual === expected
}

installDom()
const { default: mermaid } = await import('mermaid')
mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })

const results = []
for (const [index, fixture] of manifest.fixtures.entries()) {
  const source = fs.readFileSync(path.join(fixtureRoot, fixture.sourcePath), 'utf8')
  let validation = 'pass'
  let validationError = null
  try {
    await mermaid.parse(source)
  } catch (error) {
    validationError = error instanceof Error ? error.message : String(error)
    validation = validationError.includes('No diagram type detected') ? 'unsupported' : 'fail'
  }

  let render = validation === 'unsupported' ? 'unsupported' : 'fail'
  let renderError = null
  if (validation === 'pass') {
    try {
      const rendered = await mermaid.render(`baseline-${index}`, source)
      render = rendered.svg.includes('<svg') ? 'pass' : 'fail'
      document.body.replaceChildren()
    } catch (error) {
      renderError = error instanceof Error ? error.message : String(error)
      if (renderError.includes('No diagram type detected')) render = 'unsupported'
      document.body.replaceChildren()
    }
  }

  results.push({
    fixtureId: fixture.id,
    validation,
    render,
    expected: fixture.expected,
    status: matches(validation, fixture.expected.validation) && matches(render, fixture.expected.render) ? 'pass' : 'fail',
    ...(validationError ? { validationError } : {}),
    ...(renderError ? { renderError } : {}),
  })
}

const summary = {
  schemaVersion: 1,
  mermaidVersion: manifest.mermaidVersion,
  fixtureCount: results.length,
  passed: results.filter(result => result.status === 'pass').length,
  failed: results.filter(result => result.status === 'fail').length,
  results,
}

if (process.argv.includes('--write')) {
  const outputPath = path.join(repoRoot, 'docs/quality/multi-diagram-baseline/evidence/curated-mermaid-probe.json')
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`)
}
console.log(JSON.stringify(summary))
if (summary.failed > 0) process.exitCode = 1
window.close()

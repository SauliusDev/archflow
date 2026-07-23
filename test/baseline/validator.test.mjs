import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  validateBaselineEvidence,
  validateCorpusCoverage,
  validateEnvironmentMatrix,
  validateManifest,
} from '../../scripts/multi-diagram/validate.mjs'

function digest(content) {
  return createHash('sha256').update(content).digest('hex')
}

function withFixture(run) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowforge-corpus-'))
  const source = 'flowchart TD\n  A --> B\n'
  fs.mkdirSync(path.join(rootDir, 'flowchart'), { recursive: true })
  fs.writeFileSync(path.join(rootDir, 'flowchart', 'minimal.mmd'), source)
  const manifest = {
    schemaVersion: 1,
    mermaidVersion: '11.14.0',
    fixtures: [{
      id: 'flowchart-minimal',
      family: 'flowchart',
      declaration: 'flowchart',
      category: 'minimal',
      sourcePath: 'flowchart/minimal.mmd',
      provenance: {
        kind: 'offline-pack',
        path: 'test/fixtures/mermaid-docs/flowchart/examples/001-flowcharts.mmd',
      },
      mermaidVersion: '11.14.0',
      sha256: digest(source),
      expected: { validation: 'pass', render: 'pass' },
      consumingLayers: ['corpus', 'host'],
      classification: 'contract',
      tags: [],
    }],
  }

  try {
    run({ rootDir, manifest })
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true })
  }
}

function messages(errors) {
  return errors.map(error => error.message).join('\n')
}

test('manifest validator accepts a complete valid fixture', () => {
  withFixture(({ rootDir, manifest }) => {
    assert.deepEqual(validateManifest(manifest, { rootDir, installedMermaidVersion: '11.14.0' }), [])
  })
})

test('manifest validator reports a missing fixture file', () => {
  withFixture(({ rootDir, manifest }) => {
    manifest.fixtures[0].sourcePath = 'flowchart/missing.mmd'
    assert.match(messages(validateManifest(manifest, { rootDir, installedMermaidVersion: '11.14.0' })), /missing file/i)
  })
})

test('manifest validator reports duplicate stable IDs', () => {
  withFixture(({ rootDir, manifest }) => {
    manifest.fixtures.push(structuredClone(manifest.fixtures[0]))
    assert.match(messages(validateManifest(manifest, { rootDir, installedMermaidVersion: '11.14.0' })), /duplicate id/i)
  })
})

test('manifest validator reports a bad digest', () => {
  withFixture(({ rootDir, manifest }) => {
    manifest.fixtures[0].sha256 = '0'.repeat(64)
    assert.match(messages(validateManifest(manifest, { rootDir, installedMermaidVersion: '11.14.0' })), /digest/i)
  })
})

test('manifest validator reports an unknown category', () => {
  withFixture(({ rootDir, manifest }) => {
    manifest.fixtures[0].category = 'mystery'
    assert.match(messages(validateManifest(manifest, { rootDir, installedMermaidVersion: '11.14.0' })), /category/i)
  })
})

test('manifest validator reports a missing family', () => {
  withFixture(({ rootDir, manifest }) => {
    delete manifest.fixtures[0].family
    assert.match(messages(validateManifest(manifest, { rootDir, installedMermaidVersion: '11.14.0' })), /family/i)
  })
})

test('manifest validator reports stale Mermaid versions', () => {
  withFixture(({ rootDir, manifest }) => {
    assert.match(messages(validateManifest(manifest, { rootDir, installedMermaidVersion: '11.13.0' })), /stale mermaid version/i)
  })
})

test('baseline evidence validator requires environment metadata and evidence paths', () => {
  const evidence = {
    schemaVersion: 1,
    capturedAtUtc: '2026-07-18T18:42:51Z',
    environment: { os: 'Darwin', architecture: 'arm64', node: '22.23.1', npm: '10.9.8', vscode: '1.126.0', mermaid: '11.14.0' },
    commands: [{ id: 'unit', command: 'npm run test:unit', exitCode: 0, evidencePath: 'missing.log' }],
    limitations: [],
  }
  const errors = validateBaselineEvidence(evidence, { rootDir: os.tmpdir() })
  assert.match(messages(errors), /evidence path/i)
})

test('corpus coverage validator reports missing required families and provenance', () => {
  withFixture(({ rootDir, manifest }) => {
    const errors = validateCorpusCoverage(manifest, {
      rootDir,
      repoRoot: rootDir,
      requiredFamilies: ['flowchart', 'sequence'],
      requiredCategories: ['minimal'],
    })
    assert.match(messages(errors), /missing required family: sequence/i)
    assert.match(messages(errors), /provenance path is missing/i)
  })
})

test('environment matrix validator accepts the checked-in evidence matrix', () => {
  const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname)
  const matrix = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs/quality/multi-diagram-baseline/environments.json')))
  const packageDocument = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json')))
  assert.deepEqual(validateEnvironmentMatrix(matrix, packageDocument, { repoRoot }), [])
})

test('environment matrix validator detects false claims and configuration drift', () => {
  const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname)
  const matrix = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs/quality/multi-diagram-baseline/environments.json')))
  const packageDocument = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json')))
  const invalid = structuredClone(matrix)
  invalid.declared.vscodeFloor = '9.9.9'
  invalid.rows[0].observed = false
  invalid.rows[0].commands = []
  invalid.rows[0].evidencePaths = ['missing-evidence.json']
  invalid.rows[1].successorChange = ''
  const errors = validateEnvironmentMatrix(invalid, packageDocument, { repoRoot })
  assert.ok(errors.some(error => error.path.includes('vscodeFloor')))
  assert.ok(errors.some(error => error.path.includes('observed')))
  assert.ok(errors.some(error => error.path.includes('commands')))
  assert.ok(errors.some(error => error.path.includes('evidencePaths')))
  assert.ok(errors.some(error => error.path.includes('successorChange')))
})

import { describe, expect, it } from 'vitest'
import { AdapterRegistry } from '../../../../shared/adapterRegistry'
import { applySourceOperations } from '../../../lib/sourceOperations'
import { flowchartCompatibilityAdapter, issueFlowchartOperation } from './adapter'
import type { FlowchartAdapterModel } from './adapter'
import { initializeAdapterProjection } from '../../../lib/adapterPlatform'
import generalizedFixture from '../../../../../test/fixtures/mermaid-docs/flowchart/examples/020-example-flowchart-with-new-shapes.mmd?raw'
import edgeIdsFixture from '../../../../../test/fixtures/mermaid-docs/flowchart/examples/103-edge-level-curve-style-using-edge-ids-v11-10-0.mmd?raw'
import swimlaneDirectionFixture from '../../../../../test/fixtures/mermaid-docs/swimlanes/examples/097-direction-in-subgraphs.mmd?raw'

const flowchartCorpus = import.meta.glob<string>(
  '../../../../../test/fixtures/mermaid-docs/flowchart/examples/*.mmd',
  { eager: true, query: '?raw', import: 'default' },
)

const source = [
  '---',
  'title: Keep me',
  '---',
  '%%{init: {"flowchart": {"curve": "basis"}}}%%',
  'flowchart TD',
  '  subgraph Lane [Lane]',
  '    A[Alpha]',
  '    B[Beta]',
  '  end',
  '  A --> B',
  '  A --> B',
  '%% unknown stays',
  '',
].join('\n')

function apply(operation: ReturnType<typeof issueFlowchartOperation>, revision = 1) {
  const parsed = flowchartCompatibilityAdapter.parse(source, revision)
  return applySourceOperations(parsed.concrete, operation, (candidate, nextRevision) => {
    try {
      return { valid: true, concrete: flowchartCompatibilityAdapter.parse(candidate, nextRevision).concrete }
    } catch (error) {
      return { valid: false, error: String(error) }
    }
  })
}

describe('flowchartCompatibilityAdapter', () => {
  it('keeps a new empty document on Canvas and creates a Mermaid declaration on its first edit', () => {
    const parsed = flowchartCompatibilityAdapter.parse('', 1)

    expect(initializeAdapterProjection('flowchart', '', 1).diagnostics)
      .not.toContainEqual(expect.objectContaining({ code: 'code-preview-fallback' }))

    const result = applySourceOperations(
      parsed.concrete,
      issueFlowchartOperation(parsed, { kind: 'add-node', id: 'Start', label: 'Start' }),
      (candidate, revision) => ({ valid: true, concrete: flowchartCompatibilityAdapter.parse(candidate, revision).concrete }),
    )

    expect(result).toMatchObject({ success: true, document: { source: 'flowchart TD\n  Start[Start]' } })
  })

  it('accepts all 110 required Mermaid flowchart examples without losing canonical source', () => {
    expect(Object.keys(flowchartCorpus)).toHaveLength(110)
    for (const [name, example] of Object.entries(flowchartCorpus)) {
      const sourceText = String(example)
      let result
      try {
        result = flowchartCompatibilityAdapter.parse(sourceText, 1)
      } catch (error) {
        throw new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`)
      }
      expect(result.concrete.source, name).toBe(sourceText)
      expect(result.family, name).toBe('flowchart')
    }
  })

  it('accepts the graph alias and every flowchart direction through the registered adapter', () => {
    for (const declaration of ['graph TD', 'flowchart TB', 'flowchart BT', 'flowchart RL', 'flowchart LR']) {
      const result = flowchartCompatibilityAdapter.parse(`${declaration}\n  A[Alpha]\n`, 1)
      expect((result.model as FlowchartAdapterModel).nodes[0]?.id).toBe('A')
    }
  })

  it('keeps a standard inline-node request flow editable in Canvas', () => {
    const requestFlow = [
      'flowchart TD',
      '  User([User]) --> Web[Web App]',
      '  Web -->|API request| Service[Application Service]',
      '  Service --> Database[(Database)]',
      '  Service -->|Send notification| Email[Email Provider]',
      '  Email -->|Delivery status| Service',
      '  Service -->|API response| Web',
      '  Web --> User',
      '',
    ].join('\n')

    const initialized = initializeAdapterProjection('flowchart', requestFlow, 1)

    expect(initialized.diagnostics).not.toContainEqual(expect.objectContaining({ code: 'code-preview-fallback' }))
    expect((initialized.model as FlowchartAdapterModel).ambiguousNodeIds).toEqual(new Set())
  })

  it('renders referenced-only nodes without treating them as ambiguous declarations', () => {
    const source = [
      'flowchart TD',
      '  User([User]) --> Web[Web App]',
      '  Web e6@-->|API response| Response',
      '  Response --> User',
      '',
    ].join('\n')

    const initialized = initializeAdapterProjection('flowchart', source, 1)

    expect(initialized.diagnostics).not.toContainEqual(expect.objectContaining({ code: 'code-preview-fallback' }))
    expect((initialized.model as FlowchartAdapterModel).ambiguousNodeIds).not.toContain('Response')
  })

  it('keeps the unchanged inline endpoint declaration when retargeting an edge', () => {
    const inline = 'flowchart TD\n  A[Alpha] --> B[Beta]\n  C[Charlie]\n'
    const parsed = flowchartCompatibilityAdapter.parse(inline, 1)
    const edge = parsed.model.edges[0]!
    const result = applySourceOperations(
      parsed.concrete,
      issueFlowchartOperation(parsed, { kind: 'update-edge', id: edge.id, target: 'C' }),
      (candidate, revision) => ({ valid: true, concrete: flowchartCompatibilityAdapter.parse(candidate, revision).concrete }),
    )

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.document.source).toContain('A[Alpha]')
    expect(initializeAdapterProjection('flowchart', result.document.source, 2).diagnostics)
      .not.toContainEqual(expect.objectContaining({ code: 'code-preview-fallback' }))
  })

  it('projects existing nodes, subgraphs, and stable repeated edge identities through the registry', () => {
    const initialized = new AdapterRegistry([flowchartCompatibilityAdapter]).initialize('flowchart', source, 1)
    expect(initialized.status).toBe('ready')
    if (initialized.status !== 'ready') return
    const model = initialized.result.model as { nodes: Array<{ id: string }>; edges: Array<{ id: string }> }
    expect(model.nodes.map(node => node.id)).toEqual(['Lane', 'A', 'B'])
    expect(model.edges.map(edge => edge.id)).toEqual(['e1', 'e2'])
    expect(initialized.result.canvas.elements.map(element => element.id)).toEqual(['node:Lane', 'node:A', 'node:B'])
  })

  it('issues a targeted rename that preserves all unrelated bytes', () => {
    const result = apply(issueFlowchartOperation(flowchartCompatibilityAdapter.parse(source, 1), { kind: 'rename-node', id: 'A', label: 'Renamed' }))
    expect(result.success).toBe(true)
    if (result.success) expect(result.document.source).toBe(source.replace('A[Alpha]', 'A[Renamed]'))
  })

  it('issues a node-local color directive mutation without rewriting preserved styles', () => {
    const styled = '%%{init: {"flowchart": {"curve": "basis"}}}%%\nflowchart TD\n  A[Alpha]\n  %% preserve this comment\n  style A fill:#112233,stroke:#445566,color:#778899\n  classDef untouched fill:#f00\n  linkStyle 0 stroke:#0f0\n'
    const parsed = flowchartCompatibilityAdapter.parse(styled, 1)
    const result = applySourceOperations(
      parsed.concrete,
      issueFlowchartOperation(parsed, { kind: 'update-node-colors', id: 'A', fillColor: '#abcdef', strokeColor: '#445566', textColor: '#778899' }),
      (candidate, revision) => ({ valid: true, concrete: flowchartCompatibilityAdapter.parse(candidate, revision).concrete }),
    )

    expect(result.success).toBe(true)
    if (result.success) expect(result.document.source).toBe('%%{init: {"flowchart": {"curve": "basis"}}}%%\nflowchart TD\n  A[Alpha]\n  %% preserve this comment\n  style A fill:#abcdef,stroke:#445566,color:#778899\n  classDef untouched fill:#f00\n  linkStyle 0 stroke:#0f0\n')
  })

  it('adds and removes only its owned node color directive', () => {
    const plain = 'flowchart TD\n  A[Alpha]\n  %% preserved\n'
    const parsed = flowchartCompatibilityAdapter.parse(plain, 1)
    const added = applySourceOperations(
      parsed.concrete,
      issueFlowchartOperation(parsed, { kind: 'update-node-colors', id: 'A', fillColor: '#112233' }),
      (candidate, revision) => ({ valid: true, concrete: flowchartCompatibilityAdapter.parse(candidate, revision).concrete }),
    )
    expect(added.success).toBe(true)
    if (!added.success) return
    const reparsed = flowchartCompatibilityAdapter.parse(added.document.source, added.document.revision)
    const removed = applySourceOperations(
      reparsed.concrete,
      issueFlowchartOperation(reparsed, { kind: 'update-node-colors', id: 'A' }),
      (candidate, revision) => ({ valid: true, concrete: flowchartCompatibilityAdapter.parse(candidate, revision).concrete }),
    )
    expect(removed.success).toBe(true)
    if (removed.success) expect(removed.document.source).toBe(plain)
  })

  it('removes an appended color directive without adding a terminal newline', () => {
    const plain = 'flowchart TD\n  A[Alpha]'
    const parsed = flowchartCompatibilityAdapter.parse(plain, 1)
    const added = applySourceOperations(
      parsed.concrete,
      issueFlowchartOperation(parsed, { kind: 'update-node-colors', id: 'A', fillColor: '#112233' }),
      (candidate, revision) => ({ valid: true, concrete: flowchartCompatibilityAdapter.parse(candidate, revision).concrete }),
    )
    expect(added.success).toBe(true)
    if (!added.success) return
    const reparsed = flowchartCompatibilityAdapter.parse(added.document.source, added.document.revision)
    const removed = applySourceOperations(
      reparsed.concrete,
      issueFlowchartOperation(reparsed, { kind: 'update-node-colors', id: 'A' }),
      (candidate, revision) => ({ valid: true, concrete: flowchartCompatibilityAdapter.parse(candidate, revision).concrete }),
    )
    expect(removed).toMatchObject({ success: true })
    if (removed.success) expect(removed.document.source).toBe(plain)
  })

  it('updates the style directive for a referenced-only node', () => {
    const inline = 'flowchart TD\n  A --> B\n  style B fill:#112233\n'
    const parsed = flowchartCompatibilityAdapter.parse(inline, 1)
    expect(parsed.model.ambiguousNodeIds.has('B')).toBe(false)
    const result = applySourceOperations(
      parsed.concrete,
      issueFlowchartOperation(parsed, { kind: 'update-node-colors', id: 'B', fillColor: '#abcdef' }),
      (candidate, revision) => ({ valid: true, concrete: flowchartCompatibilityAdapter.parse(candidate, revision).concrete }),
    )
    expect(result).toMatchObject({ success: true })
    if (result.success) expect(result.document.source).toBe('flowchart TD\n  A --> B\n  style B fill:#abcdef\n')
  })

  it('deletes a node together with its owned color directive', () => {
    const styled = 'flowchart TD\n  A[Alpha]\n  style A fill:#112233\n  B[Beta]\n'
    const parsed = flowchartCompatibilityAdapter.parse(styled, 1)
    const result = applySourceOperations(
      parsed.concrete,
      issueFlowchartOperation(parsed, { kind: 'delete-node', id: 'A' }),
      (candidate, revision) => ({ valid: true, concrete: flowchartCompatibilityAdapter.parse(candidate, revision).concrete }),
    )

    expect(result).toMatchObject({ success: true })
    if (result.success) expect(result.document.source).toBe('flowchart TD\n  B[Beta]\n')
  })

  it('canonicalizes shorthand and repeated node style directives when colors are updated', () => {
    for (const source of [
      'flowchart TD\n  A[Alpha]\n  style A fill:#abc\n',
      'flowchart TD\n  A[Alpha]\n  style A fill:#abc\n  style A fill:#112233\n',
      'flowchart TD\n  A[Alpha]\n  style A fill:#112233\n  style A fill:#445566\n',
    ]) {
      const parsed = flowchartCompatibilityAdapter.parse(source, 1)
      expect(parsed.model.nodes.find(node => node.id === 'A')?.data.fillColor).toBeUndefined()
      const result = applySourceOperations(
        parsed.concrete,
        issueFlowchartOperation(parsed, {
          kind: 'update-node-colors', id: 'A', fillColor: '#112233', strokeColor: '#445566', strokeWidth: 3, textColor: '#778899',
        }),
        (candidate, revision) => ({ valid: true, concrete: flowchartCompatibilityAdapter.parse(candidate, revision).concrete }),
      )
      expect(result).toMatchObject({ success: true })
      if (!result.success) continue
      expect(result.document.source.match(/^  style A /gm)).toHaveLength(1)
      expect(result.document.source).toContain('  style A fill:#112233,stroke:#445566,stroke-width:3px,color:#778899')
      expect(flowchartCompatibilityAdapter.parse(result.document.source, result.document.revision).model.nodes.find(node => node.id === 'A')?.data).toMatchObject({
        fillColor: '#112233', strokeColor: '#445566', strokeWidth: 3, textColor: '#778899',
      })
    }
  })

  it('appends an overriding color style when the node source is ambiguous', () => {
    const parsed = flowchartCompatibilityAdapter.parse('flowchart TD\n  A[Alpha]\n  A[Duplicate]\n  style A fill:#abc\n', 1)

    expect(parsed.model.ambiguousNodeIds.has('A')).toBe(true)
    expect(issueFlowchartOperation(parsed, { kind: 'update-node-colors', id: 'A', fillColor: '#112233' })).toHaveLength(1)
  })

  it('canonicalizes arbitrary node style properties when inspector colors are updated', () => {
    const parsed = flowchartCompatibilityAdapter.parse('flowchart TD\n  A[Alpha]\n  style A opacity:0.5\n', 1)

    const result = applySourceOperations(
      parsed.concrete,
      issueFlowchartOperation(parsed, { kind: 'update-node-colors', id: 'A', fillColor: '#112233' }),
      (candidate, revision) => ({ valid: true, concrete: flowchartCompatibilityAdapter.parse(candidate, revision).concrete }),
    )

    expect(result).toMatchObject({ success: true })
    if (result.success) expect(result.document.source).toBe('flowchart TD\n  A[Alpha]\n  style A fill:#112233\n')
  })

  it('inserts the first color directive on a new line without changing final-newline or CR-only policy', () => {
    const noFinalNewline = 'flowchart TD\n  A[Alpha]'
    const crOnly = 'flowchart TD\r  A[Alpha]\r'
    for (const [source, expected] of [
      [noFinalNewline, 'flowchart TD\n  A[Alpha]\n  style A fill:#112233'],
      [crOnly, 'flowchart TD\r  A[Alpha]\r  style A fill:#112233\r'],
    ]) {
      const parsed = flowchartCompatibilityAdapter.parse(source, 1)
      const operations = issueFlowchartOperation(parsed, { kind: 'update-node-colors', id: 'A', fillColor: '#112233' })
      const result = applySourceOperations(parsed.concrete, operations, (candidate, revision) => ({ valid: true, concrete: flowchartCompatibilityAdapter.parse(candidate, revision).concrete }))
      expect(result.success).toBe(true)
      if (result.success) expect(result.document.source).toBe(expected)
    }
  })

  it('issues deterministic insert and delete operations', () => {
    const parsed = flowchartCompatibilityAdapter.parse(source, 1)
    const insert = issueFlowchartOperation(parsed, { kind: 'add-node', id: 'C', label: 'Gamma' })
    expect(insert).toEqual([{ kind: 'insert', at: source.indexOf('\n%% unknown stays'), text: '\n  C[Gamma]', expectedRevision: 1 }])
    const deletion = issueFlowchartOperation(parsed, { kind: 'delete-node', id: 'B' })
    expect(deletion.length).toBe(3)
    expect(deletion.every(operation => operation.kind === 'delete')).toBe(true)
  })

  it('preserves CRLF, indentation, and final-newline policy when inserting before preserved-only syntax', () => {
    const crlf = 'flowchart TD\r\n  subgraph Lane [Lane]\r\n    A[Alpha]\r\n  end\r\n  B[Beta]\r\n%% preserved-only syntax\r\n'
    const parsed = flowchartCompatibilityAdapter.parse(crlf, 4)
    const operation = issueFlowchartOperation(parsed, { kind: 'add-node', id: 'C', label: 'Gamma' })

    expect(operation).toEqual([{
      kind: 'insert', at: crlf.indexOf('\r\n%% preserved-only syntax'), text: '\r\n  C[Gamma]', expectedRevision: 4,
    }])
    const result = applySourceOperations(parsed.concrete, operation, (candidate, revision) => ({
      valid: true, concrete: flowchartCompatibilityAdapter.parse(candidate, revision).concrete,
    }))
    expect(result).toMatchObject({ success: true })
    if (result.success) expect(result.document.source).toBe(crlf.replace('\r\n%% preserved-only syntax', '\r\n  C[Gamma]\r\n%% preserved-only syntax'))
  })

  it('anchors top-level insertions after a nested subgraph closes, never inside its contents', () => {
    const nested = 'flowchart TD\n  subgraph Lane [Lane]\n    A[Alpha]\n  end\n%% preserved-only syntax\n'
    const parsed = flowchartCompatibilityAdapter.parse(nested, 6)

    expect(issueFlowchartOperation(parsed, { kind: 'add-node', id: 'B', label: 'Beta' })).toEqual([{
      kind: 'insert', at: nested.indexOf('\n%% preserved-only syntax'), text: '\n  B[Beta]', expectedRevision: 6,
    }])
  })

  it('deletes only owned ranges while preserving adjacent comments byte-for-byte', () => {
    const commented = 'flowchart TD\n  A[Alpha]\n  %% stays with A\n  B[Beta]\n%% tail\n'
    const parsed = flowchartCompatibilityAdapter.parse(commented, 5)
    const result = applySourceOperations(parsed.concrete, issueFlowchartOperation(parsed, { kind: 'delete-node', id: 'A' }), (candidate, revision) => ({
      valid: true, concrete: flowchartCompatibilityAdapter.parse(candidate, revision).concrete,
    }))

    expect(result).toMatchObject({ success: true })
    if (result.success) expect(result.document.source).toBe('flowchart TD\n  %% stays with A\n  B[Beta]\n%% tail\n')
  })

  it('targets edge labels and styles without rewriting comments, directives, or sibling edges', () => {
    const parsed = flowchartCompatibilityAdapter.parse(source, 1)
    const result = apply(issueFlowchartOperation(parsed, { kind: 'update-edge', id: 'e1', label: 'yes', style: 'dotted' }))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.document.source).toBe(source.replace('  A --> B\n  A --> B', '  A e1@-.->|yes| B\n  A --> B'))
      expect(result.document.source).toContain('%%{init: {"flowchart": {"curve": "basis"}}}%%')
      expect(result.document.source).toContain('%% unknown stays')
    }
  })

  it('preserves inline endpoint declarations when changing an edge style', () => {
    const inline = [
      'flowchart TD',
      '  User([User]) --> Web[Web App]',
      '  Web -->|API request| Service[Application Service]',
      '  Service --> Database[(Database)]',
      '',
    ].join('\n')
    const parsed = flowchartCompatibilityAdapter.parse(inline, 1)
    const edge = parsed.model.edges.find(candidate => candidate.source === 'Service' && candidate.target === 'Database')

    expect(edge).toBeDefined()
    const result = applySourceOperations(
      parsed.concrete,
      issueFlowchartOperation(parsed, { kind: 'update-edge', id: edge!.id, style: 'thick' }),
      (candidate, revision) => ({ valid: true, concrete: flowchartCompatibilityAdapter.parse(candidate, revision).concrete }),
    )

    expect(result).toMatchObject({ success: true })
    if (!result.success) return
    expect(result.document.source).toContain('Service ' + edge!.id + '@==> Database[(Database)]')
    expect(initializeAdapterProjection('flowchart', result.document.source, result.document.revision).diagnostics)
      .not.toContainEqual(expect.objectContaining({ code: 'code-preview-fallback' }))
  })

  it('changes only shape delimiters around a stable node label', () => {
    const parsed = flowchartCompatibilityAdapter.parse(source, 1)
    const result = apply(issueFlowchartOperation(parsed, { kind: 'update-node-shape', id: 'A', shape: 'diamond' }))
    expect(result.success).toBe(true)
    if (result.success) expect(result.document.source).toBe(source.replace('A[Alpha]', 'A{Alpha}'))
  })

  it('adds and deletes one edge as targeted operations', () => {
    const parsed = flowchartCompatibilityAdapter.parse(source, 1)
    const inserted = apply(issueFlowchartOperation(parsed, { kind: 'add-edge', id: 'e3', source: 'B', target: 'A', label: 'back', style: 'thick' }))
    expect(inserted.success).toBe(true)
    if (inserted.success) expect(inserted.document.source).toContain('  B e3@==>|back| A\n%% unknown stays')

    const deleted = apply(issueFlowchartOperation(parsed, { kind: 'delete-edge', id: 'e2' }))
    expect(deleted.success).toBe(true)
    if (deleted.success) expect(deleted.document.source.match(/  A --> B/g)).toHaveLength(1)
  })

  it('preserves an inline-only endpoint declaration when deleting its edge', () => {
    const source = 'flowchart TD\n  Service[Application Service]\n  Service e3@==> Database[(Database)]\n'
    const parsed = flowchartCompatibilityAdapter.parse(source, 1)

    const result = applySourceOperations(
      parsed.concrete,
      issueFlowchartOperation(parsed, { kind: 'delete-edge', id: 'e3' }),
      (candidate, revision) => ({ valid: true, concrete: flowchartCompatibilityAdapter.parse(candidate, revision).concrete }),
    )

    expect(result).toMatchObject({ success: true })
    if (!result.success) return
    expect(result.document.source).toBe('flowchart TD\n  Service[Application Service]\n  Database[(Database)]\n')
    expect(flowchartCompatibilityAdapter.parse(result.document.source, 2).model.nodes)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'Database', data: expect.objectContaining({ shape: 'cylinder' }) })]))
  })

  it('reports ambiguous repeated node declarations instead of editing an arbitrary range', () => {
    const ambiguous = source.replace('    B[Beta]', '    A[Duplicate]')
    const parsed = flowchartCompatibilityAdapter.parse(ambiguous, 1)
    expect(() => issueFlowchartOperation(parsed, { kind: 'rename-node', id: 'A', label: 'Unsafe' })).toThrow(/ambiguous/i)
  })

  it('maps stable nested subgraph boundaries while retaining opaque syntax byte-for-byte', () => {
    const nested = [
      'flowchart LR',
      '  %% keep this comment',
      '  subgraph OUTER [Outer]',
      '    subgraph INNER [Inner]',
      '      A[Alpha]',
      '    end',
      '  end',
      '  classDef custom fill:#fff',
      '',
    ].join('\n')
    const parsed = flowchartCompatibilityAdapter.parse(nested, 7)
    const model = parsed.model

    expect(model.subgraphBlocks.get('OUTER')?.opening.text).toBe('  subgraph OUTER [Outer]')
    expect(model.subgraphBlocks.get('OUTER')?.closing.text).toBe('  end')
    expect(model.subgraphBlocks.get('INNER')?.opening.text).toBe('    subgraph INNER [Inner]')
    expect(model.nodeLabels.get('A')?.text).toBe('Alpha')

    const result = applySourceOperations(
      parsed.concrete,
      issueFlowchartOperation(parsed, { kind: 'rename-node', id: 'A', label: 'Changed' }),
      (candidate, revision) => ({ valid: true, concrete: flowchartCompatibilityAdapter.parse(candidate, revision).concrete }),
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.document.source).toBe(nested.replace('A[Alpha]', 'A[Changed]'))
      expect(result.document.source).toContain('%% keep this comment')
      expect(result.document.source).toContain('classDef custom fill:#fff')
    }
  })

  it('emits the requested syntax for a newly added shaped node', () => {
    const parsed = flowchartCompatibilityAdapter.parse(source, 1)
    const operations = issueFlowchartOperation(parsed, {
      kind: 'add-node', id: 'Decision', label: 'Choose', shape: 'diamond',
    })
    expect(operations).toEqual([{
      kind: 'insert',
      at: source.indexOf('\n%% unknown stays'),
      text: '\n  Decision{Choose}',
      expectedRevision: 1,
    }])
  })

  it('reports unsupported operations instead of advertising a global mutation path', () => {
    expect(flowchartCompatibilityAdapter.supportsOperation('replace-document')).toMatchObject({ supported: false })
  })

  it('represents generalized, icon, image, inline, chained, and explicit-id syntax without rewriting it', () => {
    const modern = [
      'flowchart LR',
      '  A@{ shape: manual-file, label: "File Handling" }',
      '  I@{ icon: "fa:user", label: "Owner" }',
      '  P@{ img: "https://example.com/avatar.png", label: "Portrait" }',
      '  A edge1@--> I --> P',
      '  X[Inline] --> Y{Decision}',
      '  edge1@{ curve: basis }',
      '',
    ].join('\n')
    const result = flowchartCompatibilityAdapter.parse(modern, 3)
    const model = result.model

    expect(model.nodes.find(node => node.id === 'A')?.data).toMatchObject({ mermaidShape: 'manual-file', label: 'File Handling' })
    expect(model.nodes.find(node => node.id === 'I')?.data.mermaidShape).toBe('icon')
    expect(model.nodes.find(node => node.id === 'P')?.data.mermaidShape).toBe('image')
    expect(model.edges.map(edge => [edge.id, edge.source, edge.target])).toEqual(expect.arrayContaining([
      ['edge1', 'A', 'I'], ['e1', 'I', 'P'], ['e2', 'X', 'Y'],
    ]))
    expect(result.concrete.source).toBe(modern)
  })

  it('targets generalized node labels and shape properties when ranges are unambiguous', () => {
    const modern = 'flowchart TD\n  A@{ shape: manual-file, label: "File Handling" }\n'
    const parsed = flowchartCompatibilityAdapter.parse(modern, 1)
    const renamed = applySourceOperations(
      parsed.concrete,
      issueFlowchartOperation(parsed, { kind: 'rename-node', id: 'A', label: 'Archive' }),
      (candidate, revision) => ({ valid: true, concrete: flowchartCompatibilityAdapter.parse(candidate, revision).concrete }),
    )
    expect(renamed.success).toBe(true)
    if (renamed.success) expect(renamed.document.source).toContain('label: "Archive"')

    const reshaped = applySourceOperations(
      parsed.concrete,
      issueFlowchartOperation(parsed, { kind: 'update-node-shape', id: 'A', shape: 'diamond' }),
      (candidate, revision) => ({ valid: true, concrete: flowchartCompatibilityAdapter.parse(candidate, revision).concrete }),
    )
    expect(reshaped.success).toBe(true)
    if (reshaped.success) expect(reshaped.document.source).toContain('shape: diamond')
  })

  it('moves nodes between explicit subgraphs and top level with deterministic membership edits', () => {
    const membership = 'flowchart LR\n  subgraph One [One]\n    A[Alpha]\n  end\n  subgraph Two [Two]\n  end\n'
    const parsed = flowchartCompatibilityAdapter.parse(membership, 1)
    const moved = applySourceOperations(
      parsed.concrete,
      issueFlowchartOperation(parsed, { kind: 'move-node-to-subgraph', id: 'A', subgraphId: 'Two' }),
      (candidate, revision) => ({ valid: true, concrete: flowchartCompatibilityAdapter.parse(candidate, revision).concrete }),
    )
    expect(moved.success).toBe(true)
    if (!moved.success) return
    expect(moved.document.source).toBe('flowchart LR\n  subgraph One [One]\n  end\n  subgraph Two [Two]\n    A[Alpha]\n  end\n')

    const reparsed = flowchartCompatibilityAdapter.parse(moved.document.source, moved.document.revision)
    const promoted = applySourceOperations(
      reparsed.concrete,
      issueFlowchartOperation(reparsed, { kind: 'move-node-to-subgraph', id: 'A', subgraphId: null }),
      (candidate, revision) => ({ valid: true, concrete: flowchartCompatibilityAdapter.parse(candidate, revision).concrete }),
    )
    expect(promoted.success).toBe(true)
    if (promoted.success) expect(promoted.document.source).toContain('  end\n  A[Alpha]')
  })

  it('supports subgraph direction and explicit promote-or-delete semantics', () => {
    const lane = 'flowchart TD\n  subgraph Lane [Lane]\n    A[Alpha]\n  end\n  B[Beta]\n'
    const parsed = flowchartCompatibilityAdapter.parse(lane, 2)
    const directed = applySourceOperations(
      parsed.concrete,
      issueFlowchartOperation(parsed, { kind: 'set-subgraph-direction', id: 'Lane', direction: 'LR' }),
      (candidate, revision) => ({ valid: true, concrete: flowchartCompatibilityAdapter.parse(candidate, revision).concrete }),
    )
    expect(directed.success).toBe(true)
    if (directed.success) expect(directed.document.source).toContain('    direction LR\n    A[Alpha]')

    const promoted = applySourceOperations(
      parsed.concrete,
      issueFlowchartOperation(parsed, { kind: 'delete-subgraph', id: 'Lane', disposition: 'promote' }),
      (candidate, revision) => ({ valid: true, concrete: flowchartCompatibilityAdapter.parse(candidate, revision).concrete }),
    )
    expect(promoted.success).toBe(true)
    if (promoted.success) expect(promoted.document.source).toBe('flowchart TD\n    A[Alpha]\n  B[Beta]\n')

    const deleted = applySourceOperations(
      parsed.concrete,
      issueFlowchartOperation(parsed, { kind: 'delete-subgraph', id: 'Lane', disposition: 'delete-contents' }),
      (candidate, revision) => ({ valid: true, concrete: flowchartCompatibilityAdapter.parse(candidate, revision).concrete }),
    )
    expect(deleted.success).toBe(true)
    if (deleted.success) expect(deleted.document.source).toBe('flowchart TD\n  B[Beta]\n')
  })

  it('reorders a complete top-level subgraph block without rewriting unrelated source', () => {
    const source = [
      'flowchart TD',
      '%% keep',
      '  subgraph First [First]',
      '    A[Alpha]',
      '  end',
      '  B[Beta]',
      '  subgraph Second [Second]',
      '    C[Charlie]',
      '  end',
      '%% preserve',
      '',
    ].join('\n')
    const parsed = flowchartCompatibilityAdapter.parse(source, 7)
    const reordered = applySourceOperations(
      parsed.concrete,
      issueFlowchartOperation(parsed, {
        kind: 'reorder-top-level-subgraph', id: 'Second', beforeId: 'First',
      } as never),
      (candidate, revision) => ({ valid: true, concrete: flowchartCompatibilityAdapter.parse(candidate, revision).concrete }),
    )

    expect(reordered.success).toBe(true)
    if (reordered.success) expect(reordered.document.source).toBe([
      'flowchart TD',
      '%% keep',
      '  subgraph Second [Second]',
      '    C[Charlie]',
      '  end',
      '  subgraph First [First]',
      '    A[Alpha]',
      '  end',
      '  B[Beta]',
      '%% preserve',
      '',
    ].join('\n'))
  })

  it('builds a fixture-backed concrete map with deterministic identities and ownership boundaries', () => {
    const mapped = flowchartCompatibilityAdapter.parse([
      '---', 'config:', '  htmlLabels: false', '---',
      'graph LR', '%% retained comment',
      generalizedFixture.trim(),
      edgeIdsFixture.trim(),
      'subgraph OUTER [Outer]', '  direction TB', '  subgraph INNER [Inner]', '    direction RL', '    Legacy[Legacy]', '  end', 'end',
      'Legacy --> Target', 'Legacy --> Target', 'click Legacy callback "Keep this"',
      'classDef emphasis fill:#fff', 'class Legacy emphasis', 'style Legacy fill:#eee', '',
    ].join('\n'), 3).model.sourceMap

    expect(mapped.declaration?.identity).toBe('declaration:0')
    expect(mapped.constructs.find(item => item.identity === 'node:A')?.ownership).toBe('represented')
    expect(mapped.constructs.filter(item => item.kind === 'edge').map(item => item.identity)).toEqual([
      'edge:e1', 'edge:e2', 'edge:Legacy:Target:0', 'edge:Legacy:Target:1',
    ])
    expect(mapped.constructs.find(item => item.identity === 'subgraph:OUTER')?.ownership).toBe('represented')
    expect(mapped.constructs.find(item => item.kind === 'direction' && item.parentIdentity === 'subgraph:INNER')?.ownership).toBe('represented')
    expect(mapped.constructs.filter(item => ['frontmatter', 'comment', 'click'].includes(item.kind)).every(item => item.ownership === 'preserved-only')).toBe(true)
    expect(mapped.diagnostics).toEqual([])

    const swimlaneMap = flowchartCompatibilityAdapter.parse(swimlaneDirectionFixture, 4).model.sourceMap
    expect(swimlaneMap.constructs.filter(item => item.kind === 'subgraph').map(item => item.identity)).toEqual(['subgraph:TOP', 'subgraph:B1', 'subgraph:B2'])
    expect(swimlaneMap.constructs.filter(item => item.kind === 'direction').map(item => item.parentIdentity)).toEqual(['subgraph:TOP', 'subgraph:B1', 'subgraph:B2'])
  })

  it('fails closed instead of assigning handles to malformed or ambiguous concrete structure', () => {
    const ambiguous = initializeAdapterProjection('flowchart', 'flowchart LR\n  subgraph A\n    A[duplicate]\n  end\n  A[again]\n', 1)
    expect(ambiguous.diagnostics).toContainEqual(expect.objectContaining({ code: 'code-preview-fallback' }))
    expect(() => flowchartCompatibilityAdapter.parse('flowchart LR\n  subgraph A\n    B[Broken]\n', 1)).toThrow(/unterminated/i)
    expect(() => flowchartCompatibilityAdapter.parse('flowchart LR\n  A@{ shape: manual-file, label: "Broken"\n', 1)).toThrow(/malformed/i)
  })
})

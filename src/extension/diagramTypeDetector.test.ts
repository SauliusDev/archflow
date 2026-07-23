import { describe, expect, it } from 'vitest'
import { detectDiagramFamily } from './diagramTypeDetector'

describe('detectDiagramFamily', () => {
  it.each([
    ['flowchart LR\n  A --> B', 'flowchart'],
    ['GRAPH TD\n  A --> B', 'flowchart'],
    ['sequenceDiagram\n  A->>B: Hi', 'sequence'],
    ['zenuml\n  A.method()', 'zenuml'],
    ['classDiagram\n  class A', 'class'],
    ['stateDiagram\n  [*] --> A', 'state'],
    ['stateDiagram-v2\n  [*] --> A', 'state'],
    ['erDiagram\n  A ||--o{ B : has', 'er'],
    ['architecture-beta\n  service api(server)', 'architecture'],
    ['C4Context\n  Person(user, "User")', 'c4-context'],
    ['c4container\n  Container(api, "API")', 'c4-container'],
    ['C4Component\n  Component(ui, "UI")', 'c4-component'],
    ['C4Dynamic\n  Rel(a, b, "calls")', 'c4-dynamic'],
    ['C4Deployment\n  Deployment_Node(node, "Host")', 'c4-deployment'],
  ])('detects %s as %s', (source, family) => {
    expect(detectDiagramFamily(source).family).toBe(family)
  })

  it('skips BOM, front matter, directives, comments, whitespace, and preserves input', () => {
    const source = '\uFEFF---\ntitle: Demo\n---\n\n%%{init: {"theme":"dark"}}%%\n%% comment\n  CLASSDIAGRAM\n  class A'
    const before = source.slice()
    expect(detectDiagramFamily(source)).toMatchObject({ family: 'class', declaration: 'CLASSDIAGRAM' })
    expect(source).toBe(before)
  })

  it.each(['', '  \n', '%% comment\n', '\uFEFF---\ntitle: Empty\n---\n%% comment'])('treats empty preambles as empty', source => {
    expect(detectDiagramFamily(source)).toEqual({ family: 'empty', declaration: null })
  })

  it('returns the observed declaration for another family', () => {
    expect(detectDiagramFamily('gantt\n  title Plan')).toEqual({ family: 'other', declaration: 'gantt' })
  })

  it('treats malformed front matter as an observed nonvisual declaration', () => {
    expect(detectDiagramFamily('---\ntitle: Missing end\nflowchart TD')).toEqual({ family: 'other', declaration: '---' })
  })
})
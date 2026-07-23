import type { DiagramFamily } from '../shared/diagram-contracts'

export interface DiagramDetectionResult {
  family: DiagramFamily
  declaration: string | null
}

const DECLARATION_FAMILIES: Readonly<Record<string, DiagramFamily>> = Object.freeze({
  flowchart: 'flowchart',
  graph: 'flowchart',
  sequencediagram: 'sequence',
  zenuml: 'zenuml',
  classdiagram: 'class',
  statediagram: 'state',
  'statediagram-v2': 'state',
  erdiagram: 'er',
  'architecture-beta': 'architecture',
  c4context: 'c4-context',
  c4container: 'c4-container',
  c4component: 'c4-component',
  c4dynamic: 'c4-dynamic',
  c4deployment: 'c4-deployment',
})

function skipFrontMatter(lines: string[], start: number): number {
  if (lines[start]?.trim() !== '---') return start
  for (let index = start + 1; index < lines.length; index++) {
    const trimmed = lines[index].trim()
    if (trimmed === '---' || trimmed === '...') return index + 1
  }
  return start
}

export function detectDiagramFamily(content: string): DiagramDetectionResult {
  const source = content.startsWith('\uFEFF') ? content.slice(1) : content
  const lines = source.split(/\r?\n/)
  let index = 0

  while (index < lines.length && lines[index].trim() === '') index++
  index = skipFrontMatter(lines, index)

  for (; index < lines.length; index++) {
    const trimmed = lines[index].trim()
    if (!trimmed || trimmed.startsWith('%%')) continue
    const declaration = trimmed.split(/\s+/)[0]
    return {
      family: DECLARATION_FAMILIES[declaration.toLowerCase()] ?? 'other',
      declaration,
    }
  }

  return { family: 'empty', declaration: null }
}

/** Compatibility helper for callers that only distinguish the legacy Canvas. */
export function detectDiagramType(content: string): 'flowchart' | 'unknown' {
  const { family } = detectDiagramFamily(content)
  return family === 'flowchart' || family === 'empty' ? 'flowchart' : 'unknown'
}
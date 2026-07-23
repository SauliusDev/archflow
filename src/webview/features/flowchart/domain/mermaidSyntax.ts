import type { EdgeStyle, NodeShape } from './types'

// Maps NodeShape → Mermaid bracket open/close tokens used by serialize() in Story 2.7.
// subgraph emits a block (subgraph ... end) — its open/close are empty placeholders.
export const shapeTemplates: Record<NodeShape, { open: string; close: string }> = {
  rectangle: { open: '[',   close: ']'   },
  rounded:   { open: '(',   close: ')'   },
  pill:      { open: '([',  close: '])'  },
  diamond:   { open: '{',   close: '}'   },
  circle:    { open: '((', close: '))'  },
  hexagon:   { open: '{{',  close: '}}'  },
  cylinder:  { open: '[(', close: ')]'  },
  subgraph:  { open: '',    close: ''    },
}

// Maps EdgeStyle → Mermaid arrow syntax used by serialize() in Story 2.7.
export const edgeConnectors: Record<EdgeStyle, string> = {
  arrow:  '-->',
  dotted: '-.->',
  thick:  '==>',
  open:   '---',
}

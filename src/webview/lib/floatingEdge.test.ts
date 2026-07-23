import { Position } from '@xyflow/react'
import type { InternalNode, Node } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import { getEdgeParams, resolveEdgeAttachment } from './floatingEdge'

function internalNode(x: number, y: number, width = 100, height = 40, data: Record<string, unknown> = {}): InternalNode<Node> {
  return {
    data,
    measured: { width, height },
    internals: { positionAbsolute: { x, y } },
  } as unknown as InternalNode<Node>
}

describe('resolveEdgeAttachment', () => {
  it.each([
    ['right', { x: 100, y: 20 }, Position.Right],
    ['top', { x: 50, y: 0 }, Position.Top],
    ['bottom', { x: 50, y: 40 }, Position.Bottom],
    ['left', { x: 0, y: 20 }, Position.Left],
  ] as const)('uses the requested %s midpoint', (side, point, position) => {
    expect(resolveEdgeAttachment(internalNode(0, 0), internalNode(300, 0), side)).toEqual({ point, side: position })
  })
})

describe('getEdgeParams', () => {
  it('honors requested right and left endpoint sides', () => {
    expect(getEdgeParams(internalNode(0, 0), internalNode(0, 200), 'right', 'left')).toMatchObject({
      sx: 100,
      sy: 20,
      tx: 0,
      ty: 220,
      sourcePos: Position.Right,
      targetPos: Position.Left,
    })
  })

  it('attaches a diamond edge to its visible perimeter instead of its rectangular bounds', () => {
    const source = internalNode(0, 0, 100, 100, { label: 'Decision', shape: 'diamond' })
    const target = internalNode(250, 150, 100, 100)

    expect(getEdgeParams(source, target)).toMatchObject({
      sx: 81.25,
      sy: 68.75,
    })
  })
})

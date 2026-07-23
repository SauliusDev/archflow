import { describe, expect, it } from 'vitest'
import { connectionPreviewPath, connectionPreviewStart } from './pendingConnectionPreview'

describe('connectionPreviewStart', () => {
  const rect = { left: 100, top: 200, width: 160, height: 64 }

  it.each([
    ['top', { x: 180, y: 200 }],
    ['right', { x: 260, y: 232 }],
    ['bottom', { x: 180, y: 264 }],
    ['left', { x: 100, y: 232 }],
  ] as const)('uses the %s midpoint as the preview anchor', (side, expected) => {
    expect(connectionPreviewStart(rect, side)).toEqual(expected)
  })
})

describe('connectionPreviewPath', () => {
  it('leaves the selected side with a cubic Bezier tangent', () => {
    expect(connectionPreviewPath({ x: 100, y: 50 }, { x: 200, y: 250 }, 'bottom'))
      .toBe('M 100 50 C 100 100, 200 200, 200 250')
  })
})

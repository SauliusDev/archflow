import { describe, expect, it, vi } from 'vitest'
import type { CommandResult } from '../../shared/diagram-contracts'

const { sendToHost } = vi.hoisted(() => ({ sendToHost: vi.fn() }))

vi.mock('../vscode', () => ({ sendToHost }))

import { reportCommandFailure } from './commandReporting'

const failure = (code: Extract<CommandResult<never>, { ok: false }>['code'], message = 'Details') => ({
  ok: false as const,
  code,
  message,
})

describe('reportCommandFailure', () => {
  it.each([
    ['invalid-source', 'Unable to update the diagram source.'],
    ['invalid-operation', 'Details'],
    ['unsupported-family', 'This action is unavailable for this diagram.'],
    ['external-conflict', 'Resolve external changes before editing.'],
    ['stale-transaction', 'The diagram changed. Please try again.'],
    ['persistence-conflict', 'The document changed before it could be saved. Please try again.'],
  ] as const)('announces expected %s failures without host logging', (code, announcement) => {
    expect(reportCommandFailure(failure(code), 'test command')).toEqual({ announcement })
    expect(sendToHost).not.toHaveBeenCalled()
  })

  it('logs one safe structured record for an internal failure without serializing the cause', () => {
    expect(reportCommandFailure({ ...failure('internal-error', 'credential=super-secret'), cause: new Error('credential=super-secret') }, 'rename node')).toEqual({
      announcement: 'Something went wrong. Please try again.',
    })
    expect(sendToHost).toHaveBeenCalledOnce()
    expect(sendToHost).toHaveBeenCalledWith({
      type: 'LOG',
      payload: {
        level: 'error',
        message: JSON.stringify({ code: 'internal-error', context: 'rename node', message: 'Unexpected internal error' }),
      },
    })
    expect(JSON.stringify(sendToHost.mock.calls)).not.toContain('super-secret')
  })
})

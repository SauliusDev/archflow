import type { CommandResult } from '../../shared/diagram-contracts'
import type { FlowforgeState } from './types'
import { sendToHost } from '../vscode'

type CommandFailure = Extract<CommandResult<never>, { ok: false }>

const announcementByCode: Record<Exclude<CommandFailure['code'], 'invalid-operation' | 'internal-error'>, string> = {
  'unsupported-family': 'This action is unavailable for this diagram.',
  'invalid-source': 'Unable to update the diagram source.',
  'stale-transaction': 'The diagram changed. Please try again.',
  'external-conflict': 'Resolve external changes before editing.',
  'persistence-conflict': 'The document changed before it could be saved. Please try again.',
}

/** Converts a command failure into the only user-visible state change it may make. */
export function reportCommandFailure(
  failure: Extract<CommandResult<never>, { ok: false }>,
  context: string,
): Pick<FlowforgeState, 'announcement'> {
  if (failure.code === 'internal-error') {
    sendToHost({
      type: 'LOG',
      payload: {
        level: 'error',
        message: JSON.stringify({ code: failure.code, context, message: 'Unexpected internal error' }),
      },
    })
    return { announcement: 'Something went wrong. Please try again.' }
  }
  return {
    announcement: failure.code === 'invalid-operation'
      ? failure.message
      : announcementByCode[failure.code],
  }
}

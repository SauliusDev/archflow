export type CommandFailureCode =
  | 'unsupported-family'
  | 'invalid-source'
  | 'stale-transaction'
  | 'external-conflict'
  | 'invalid-operation'
  | 'persistence-conflict'
  | 'internal-error'

export type CommandResult<T> =
  | { ok: true; value: T; announcement?: string }
  | { ok: false; code: CommandFailureCode; message: string; cause?: unknown }

/** A validation failure intentionally raised while planning a semantic edit. */
export class SemanticValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SemanticValidationError'
  }
}

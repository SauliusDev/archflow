import { isDiagramFamily, type CommandResult } from '../diagram-contracts'
import type { HostToWebviewMessage, WebviewToHostMessage } from './messages'

type MessageRecord = Record<string, unknown>

function failure(message: string): CommandResult<never> {
  return { ok: false, code: 'invalid-operation', message }
}

function isRecord(value: unknown): value is MessageRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOptionalString(record: MessageRecord, key: string): boolean {
  return record[key] === undefined || typeof record[key] === 'string'
}

function hasOptionalBoolean(record: MessageRecord, key: string): boolean {
  return record[key] === undefined || typeof record[key] === 'boolean'
}

function hasOptionalNumber(record: MessageRecord, key: string): boolean {
  return record[key] === undefined || (typeof record[key] === 'number' && Number.isFinite(record[key]))
}

function isNewEdgeRouteMode(value: unknown): boolean {
  return value === 'straight' || value === 'orthogonal' || value === 'curved'
}

function isLayoutStyle(value: unknown): boolean {
  return value === 'classic' || value === 'modern'
}

function isGridStyle(value: unknown): boolean {
  return value === 'grid' || value === 'dots'
}

function hasMessageRevision(record: MessageRecord): boolean {
  return hasOptionalString(record, 'sessionId')
    && hasOptionalNumber(record, 'baseRevision')
    && hasOptionalString(record, 'eventId')
}

function hasEmptyPayload(record: MessageRecord): boolean {
  const payload = record.payload
  return isRecord(payload) && Object.keys(payload).length === 0
}

function payloadOf(record: MessageRecord): MessageRecord | undefined {
  return isRecord(record.payload) ? record.payload : undefined
}

function isSavePayload(payload: MessageRecord): boolean {
  return typeof payload.content === 'string'
    && hasOptionalString(payload, 'sessionId')
    && hasOptionalString(payload, 'transactionId')
    && hasOptionalNumber(payload, 'expectedHostRevision')
    && hasOptionalNumber(payload, 'workingRevision')
}

function isExportPayload(payload: MessageRecord): boolean {
  return typeof payload.content === 'string'
    && payload.format === 'mmd'
    && (payload.subtype === 'file' || payload.subtype === 'clipboard')
}

function isLogPayload(payload: MessageRecord): boolean {
  return typeof payload.message === 'string'
    && (payload.level === 'info' || payload.level === 'warn' || payload.level === 'error')
}

function isSetPreferencePayload(payload: MessageRecord): boolean {
  const isBooleanPreference = (payload.preference === 'autoSave' || payload.preference === 'smartRouting' || payload.preference === 'snapToGrid')
    && typeof payload.value === 'boolean'
  const isRoutePreference = payload.preference === 'newEdgeRouteMode' && isNewEdgeRouteMode(payload.value)
  const isLayoutStylePreference = payload.preference === 'layoutStyle' && isLayoutStyle(payload.value)
  const isGridStylePreference = payload.preference === 'gridStyle' && isGridStyle(payload.value)
  const hasValidPreferenceValue = isBooleanPreference || isRoutePreference || isLayoutStylePreference || isGridStylePreference
  return hasValidPreferenceValue && typeof payload.requestId === 'string' && payload.requestId.length > 0
}

function isLoadPayload(payload: MessageRecord): boolean {
  return typeof payload.content === 'string'
    && hasOptionalString(payload, 'filename')
    && hasOptionalBoolean(payload, 'autoSave')
    && hasOptionalBoolean(payload, 'smartRouting')
    && hasOptionalBoolean(payload, 'snapToGrid')
    && (payload.gridStyle === undefined || isGridStyle(payload.gridStyle))
    && (payload.newEdgeRouteMode === undefined || isNewEdgeRouteMode(payload.newEdgeRouteMode))
    && (payload.layoutStyle === undefined || isLayoutStyle(payload.layoutStyle))
    && hasOptionalString(payload, 'sessionId')
    && hasOptionalString(payload, 'eventId')
    && hasOptionalNumber(payload, 'hostRevision')
    && hasOptionalNumber(payload, 'workingRevision')
    && (payload.family === undefined || isDiagramFamily(payload.family))
}

function isExternalFileChangePayload(payload: MessageRecord): boolean {
  return typeof payload.content === 'string'
    && hasOptionalString(payload, 'sessionId')
    && hasOptionalString(payload, 'eventId')
    && hasOptionalNumber(payload, 'hostRevision')
    && hasOptionalNumber(payload, 'workingRevision')
    && hasOptionalString(payload, 'originTransactionId')
}

function isSaveResultPayload(payload: MessageRecord): boolean {
  return typeof payload.success === 'boolean'
    && hasOptionalString(payload, 'error')
    && hasOptionalString(payload, 'sessionId')
    && hasOptionalString(payload, 'transactionId')
    && hasOptionalNumber(payload, 'hostRevision')
    && hasOptionalNumber(payload, 'savedWorkingRevision')
    && hasOptionalNumber(payload, 'workingRevision')
    && hasOptionalBoolean(payload, 'conflict')
    && hasOptionalString(payload, 'externalContent')
}

function isPreferenceResultPayload(payload: MessageRecord): boolean {
  const isBooleanPreference = (payload.preference === 'autoSave' || payload.preference === 'smartRouting' || payload.preference === 'snapToGrid')
    && typeof payload.value === 'boolean'
  const isRoutePreference = payload.preference === 'newEdgeRouteMode' && isNewEdgeRouteMode(payload.value)
  const isLayoutStylePreference = payload.preference === 'layoutStyle' && isLayoutStyle(payload.value)
  const isGridStylePreference = payload.preference === 'gridStyle' && isGridStyle(payload.value)
  const hasValidPreferenceValue = isBooleanPreference || isRoutePreference || isLayoutStylePreference || isGridStylePreference
  return hasValidPreferenceValue && typeof payload.success === 'boolean'
    && typeof payload.requestId === 'string' && payload.requestId.length > 0
    && hasOptionalString(payload, 'error')
}

function isPreferenceChangedPayload(payload: MessageRecord): boolean {
  return (payload.preference === 'snapToGrid' && typeof payload.value === 'boolean')
    || (payload.preference === 'newEdgeRouteMode' && isNewEdgeRouteMode(payload.value))
    || (payload.preference === 'layoutStyle' && isLayoutStyle(payload.value))
    || (payload.preference === 'gridStyle' && isGridStyle(payload.value))
}

export function parseWebviewToHostMessage(value: unknown): CommandResult<WebviewToHostMessage> {
  if (!isRecord(value)) return failure('Webview message must be an object')
  if (typeof value.type !== 'string') return failure('Webview message type must be a string')

  switch (value.type) {
    case 'SAVE': {
      const payload = payloadOf(value)
      return hasMessageRevision(value) && payload && isSavePayload(payload)
        ? { ok: true, value: value as WebviewToHostMessage }
        : failure('Invalid SAVE message')
    }
    case 'READY':
      return hasEmptyPayload(value)
        ? { ok: true, value: value as WebviewToHostMessage }
        : failure(`Invalid ${value.type} message`)
    case 'EXPORT': {
      const payload = payloadOf(value)
      return payload && isExportPayload(payload)
        ? { ok: true, value: value as WebviewToHostMessage }
        : failure('Invalid EXPORT message')
    }
    case 'LOG': {
      const payload = payloadOf(value)
      return payload && isLogPayload(payload)
        ? { ok: true, value: value as WebviewToHostMessage }
        : failure('Invalid LOG message')
    }
    case 'SET_PREFERENCE': {
      const payload = payloadOf(value)
      return payload && isSetPreferencePayload(payload)
        ? { ok: true, value: value as WebviewToHostMessage }
        : failure('Invalid SET_PREFERENCE message')
    }
    default:
      return failure(`Unknown webview message type: ${value.type}`)
  }
}

export function parseHostToWebviewMessage(value: unknown): CommandResult<HostToWebviewMessage> {
  if (!isRecord(value)) return failure('Host message must be an object')
  if (typeof value.type !== 'string') return failure('Host message type must be a string')

  switch (value.type) {
    case 'LOAD': {
      const payload = payloadOf(value)
      return hasMessageRevision(value) && payload && isLoadPayload(payload)
        ? { ok: true, value: value as HostToWebviewMessage }
        : failure('Invalid LOAD message')
    }
    case 'THEME_CHANGED': {
      const payload = payloadOf(value)
      return payload && (payload.kind === 'dark' || payload.kind === 'light' || payload.kind === 'highContrast')
        ? { ok: true, value: value as HostToWebviewMessage }
        : failure('Invalid THEME_CHANGED message')
    }
    case 'PREFERENCE_RESULT': {
      const payload = payloadOf(value)
      return payload && isPreferenceResultPayload(payload)
        ? { ok: true, value: value as HostToWebviewMessage }
        : failure('Invalid PREFERENCE_RESULT message')
    }
    case 'PREFERENCE_CHANGED': {
      const payload = payloadOf(value)
      return payload && isPreferenceChangedPayload(payload)
        ? { ok: true, value: value as HostToWebviewMessage }
        : failure('Invalid PREFERENCE_CHANGED message')
    }
    case 'EXTERNAL_FILE_CHANGE': {
      const payload = payloadOf(value)
      return hasMessageRevision(value) && payload && isExternalFileChangePayload(payload)
        ? { ok: true, value: value as HostToWebviewMessage }
        : failure('Invalid EXTERNAL_FILE_CHANGE message')
    }
    case 'SAVE_RESULT': {
      const payload = payloadOf(value)
      return hasMessageRevision(value) && payload && isSaveResultPayload(payload)
        ? { ok: true, value: value as HostToWebviewMessage }
        : failure('Invalid SAVE_RESULT message')
    }
    default:
      return failure(`Unknown host message type: ${value.type}`)
  }
}

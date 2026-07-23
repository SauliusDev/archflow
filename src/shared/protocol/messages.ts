import type { DiagramFamily } from '../diagram-contracts'

export type NewEdgeRouteMode = 'straight' | 'orthogonal' | 'curved'
export type LayoutStyle = 'classic' | 'modern'
export type GridStyle = 'grid' | 'dots'

export interface MessageRevision {
  sessionId?: string
  baseRevision?: number
  eventId?: string
}

export type HostToWebviewMessage =
  | ({ type: 'LOAD'; payload: LoadPayload } & MessageRevision)
  | { type: 'THEME_CHANGED'; payload: ThemePayload }
  | { type: 'PREFERENCE_RESULT'; payload: PreferenceResultPayload }
  | { type: 'PREFERENCE_CHANGED'; payload: PreferenceChangedPayload }
  | ({ type: 'EXTERNAL_FILE_CHANGE'; payload: ExternalFileChangePayload } & MessageRevision)
  | ({ type: 'SAVE_RESULT'; payload: SaveResultPayload } & MessageRevision)

export interface LoadPayload {
  content: string
  filename?: string
  autoSave?: boolean
  smartRouting?: boolean
  snapToGrid?: boolean
  gridStyle?: GridStyle
  newEdgeRouteMode?: NewEdgeRouteMode
  layoutStyle?: LayoutStyle
  sessionId?: string
  eventId?: string
  hostRevision?: number
  workingRevision?: number
  family?: DiagramFamily
}

export interface ThemePayload {
  kind: 'dark' | 'light' | 'highContrast'
}

export type PreferenceResultPayload = {
  preference: 'autoSave' | 'smartRouting' | 'snapToGrid'
  success: boolean
  value: boolean
  requestId: string
  error?: string
} | {
  preference: 'newEdgeRouteMode'
  success: boolean
  value: NewEdgeRouteMode
  requestId: string
  error?: string
} | {
  preference: 'layoutStyle'
  success: boolean
  value: LayoutStyle
  requestId: string
  error?: string
} | {
  preference: 'gridStyle'
  success: boolean
  value: GridStyle
  requestId: string
  error?: string
}

export type PreferenceChangedPayload = {
  preference: 'snapToGrid'
  value: boolean
} | {
  preference: 'newEdgeRouteMode'
  value: NewEdgeRouteMode
} | {
  preference: 'layoutStyle'
  value: LayoutStyle
} | {
  preference: 'gridStyle'
  value: GridStyle
}

export interface ExternalFileChangePayload {
  content: string
  sessionId?: string
  eventId?: string
  hostRevision?: number
  workingRevision?: number
  originTransactionId?: string
}

export interface SaveResultPayload {
  success: boolean
  error?: string
  sessionId?: string
  transactionId?: string
  hostRevision?: number
  savedWorkingRevision?: number
  workingRevision?: number
  conflict?: boolean
  externalContent?: string
}

export type WebviewToHostMessage =
  | ({ type: 'SAVE'; payload: SavePayload } & MessageRevision)
  | { type: 'READY'; payload: Record<string, never> }
  | { type: 'EXPORT'; payload: ExportPayload }
  | { type: 'LOG'; payload: LogPayload }
  | { type: 'SET_PREFERENCE'; payload: SetPreferencePayload }

export interface SavePayload {
  content: string
  sessionId?: string
  transactionId?: string
  expectedHostRevision?: number
  workingRevision?: number
}

export interface ExportPayload {
  content: string
  format: 'mmd'
  subtype: 'file' | 'clipboard'
}

export interface LogPayload {
  level: 'info' | 'warn' | 'error'
  message: string
}

export type SetPreferencePayload = {
  preference: 'autoSave' | 'smartRouting' | 'snapToGrid'
  value: boolean
  requestId: string
} | {
  preference: 'newEdgeRouteMode'
  value: NewEdgeRouteMode
  requestId: string
} | {
  preference: 'layoutStyle'
  value: LayoutStyle
  requestId: string
} | {
  preference: 'gridStyle'
  value: GridStyle
  requestId: string
}

import { createContext, useContext } from 'react'
import type { NewEdgeRouteMode } from '../../../../shared/protocol'

export const NewEdgeRouteModeContext = createContext<NewEdgeRouteMode>('curved')

export function useNewEdgeRouteMode(): NewEdgeRouteMode {
  return useContext(NewEdgeRouteModeContext)
}

import { createContext, useContext } from 'react'

export const SmartRoutingContext = createContext(true)

export function useSmartRouting(): boolean {
  return useContext(SmartRoutingContext)
}

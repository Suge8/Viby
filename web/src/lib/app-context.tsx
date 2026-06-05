import { createContext, type ReactNode, useContext } from 'react'
import type { ApiClient } from '@/api/client'

export type AppApi = ApiClient

export type AppContextValue = {
    api: AppApi
    token: string
    baseUrl: string
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppContextProvider(props: { value: AppContextValue; children: ReactNode }) {
    return <AppContext.Provider value={props.value}>{props.children}</AppContext.Provider>
}

export function useAppContext(): AppContextValue {
    const context = useContext(AppContext)
    if (!context) {
        throw new Error('AppContext is not available')
    }
    return context
}

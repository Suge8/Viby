import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { ApiClient } from '@/api/client'
import type { LocalSessionCatalog, LocalSessionCatalogEntry } from '@/types/api'
import {
    type NewSessionMode,
    RECOVER_LOCAL_DRIVER_SELECTION_NONE,
    type RecoverLocalDriverSelection,
} from './newSessionModes'
import { buildRecoverSelectionKey } from './recoverLocalSelection'

type HapticFeedback = {
    notification: (type: 'success' | 'error') => void
}

type RecoverLocalStateOptions = {
    api: ApiClient
    initialMode?: NewSessionMode
    isFormDisabled: boolean
    directory: string | null
    haptic: HapticFeedback
    onSuccess: (sessionId: string) => Promise<void> | void
    clearError: () => void
    setError: (message: string) => void
    formatError: (error: unknown) => string
    t: (key: string) => string
}

type RecoverLocalSearchEntry = {
    session: LocalSessionCatalogEntry
    selectionKey: string
    searchText: string
}

const EMPTY_LOCAL_SESSION_CATALOG: LocalSessionCatalog = {
    capabilities: [],
    sessions: [],
}

type RecoverCatalogState = {
    catalog: LocalSessionCatalog
    catalogDirectory: string | null
    isLoading: boolean
    loadError: string | null
}

const EMPTY_RECOVER_CATALOG_STATE: RecoverCatalogState = {
    catalog: EMPTY_LOCAL_SESSION_CATALOG,
    catalogDirectory: null,
    isLoading: false,
    loadError: null,
}

function indexRecoverSession(session: LocalSessionCatalogEntry): RecoverLocalSearchEntry {
    return {
        session,
        selectionKey: buildRecoverSelectionKey(session),
        searchText: [session.title, session.path, session.driver]
            .filter((value): value is string => typeof value === 'string' && value.length > 0)
            .join('\n')
            .toLowerCase(),
    }
}

function useRecoverCatalog(options: {
    api: ApiClient
    mode: NewSessionMode
    directory: string | null
    driverSelection: RecoverLocalDriverSelection
    formatError: (error: unknown) => string
}) {
    const [state, setState] = useState<RecoverCatalogState>(EMPTY_RECOVER_CATALOG_STATE)
    const deferredDirectory = useDeferredValue(options.directory)
    const formatErrorRef = useRef(options.formatError)

    useEffect(() => {
        formatErrorRef.current = options.formatError
    }, [options.formatError])

    useEffect(() => {
        if (
            !deferredDirectory ||
            options.mode !== 'recover-local' ||
            options.driverSelection === RECOVER_LOCAL_DRIVER_SELECTION_NONE
        ) {
            setState(EMPTY_RECOVER_CATALOG_STATE)
            return
        }

        const abortController = new AbortController()
        let cancelled = false
        setState({ ...EMPTY_RECOVER_CATALOG_STATE, isLoading: true })
        options.api
            .listRuntimeLocalSessions(deferredDirectory, options.driverSelection, { signal: abortController.signal })
            .then((catalog) => {
                if (!cancelled)
                    setState({ catalog, catalogDirectory: deferredDirectory, isLoading: false, loadError: null })
            })
            .catch((error) => {
                if (cancelled || abortController.signal.aborted) return
                setState({
                    ...EMPTY_RECOVER_CATALOG_STATE,
                    loadError: formatErrorRef.current(error),
                })
            })

        return () => {
            cancelled = true
            abortController.abort()
        }
    }, [deferredDirectory, options.api, options.driverSelection, options.mode])

    return {
        ...state,
        isCatalogCurrent:
            Boolean(options.directory) &&
            !state.isLoading &&
            state.catalogDirectory === options.directory &&
            deferredDirectory === options.directory,
    }
}

function useRecoverSearch(catalog: LocalSessionCatalog, searchQuery: string) {
    const deferredQuery = useDeferredValue(searchQuery.trim().toLowerCase())
    const searchEntries = useMemo(() => catalog.sessions.map(indexRecoverSession), [catalog.sessions])
    const filteredSearchEntries = useMemo(() => {
        if (!deferredQuery) return searchEntries
        return searchEntries.filter((entry) => entry.searchText.includes(deferredQuery))
    }, [deferredQuery, searchEntries])

    return {
        filteredSearchEntries,
        filteredSessions: useMemo(() => filteredSearchEntries.map((entry) => entry.session), [filteredSearchEntries]),
        unavailableCapabilities: useMemo(
            () => catalog.capabilities.filter((capability) => !capability.supported),
            [catalog.capabilities]
        ),
    }
}

function useRecoverSelection(mode: NewSessionMode, entries: RecoverLocalSearchEntry[]) {
    const [selectedKey, setSelectedKey] = useState<string | null>(null)

    useEffect(() => {
        if (mode !== 'recover-local') return
        if (selectedKey && entries.some((entry) => entry.selectionKey === selectedKey)) return
        setSelectedKey(entries[0]?.selectionKey ?? null)
    }, [entries, mode, selectedKey])

    return {
        selectedKey,
        selectedSession: entries.find((entry) => entry.selectionKey === selectedKey)?.session ?? null,
        setSelectedKey,
        clearSelection: useCallback(() => setSelectedKey(null), []),
    }
}

type RecoverLocalActionOptions = Pick<
    RecoverLocalStateOptions,
    'api' | 'directory' | 'haptic' | 'onSuccess' | 'clearError' | 'setError' | 'formatError' | 'isFormDisabled'
> & {
    catalogDirectory: string | null
    isCatalogCurrent: boolean
    selectedSession: LocalSessionCatalogEntry | null
}

function useRecoverAction(options: RecoverLocalActionOptions) {
    const [isRecovering, setIsRecovering] = useState(false)
    const handleRecover = useCallback(async (): Promise<void> => {
        const session = options.selectedSession
        if (!session || !options.directory || !options.isCatalogCurrent) return
        if (!options.catalogDirectory) throw new Error('Recover-local catalog path unavailable')

        options.clearError()
        setIsRecovering(true)
        try {
            const recovered = await options.api.importRuntimeLocalSession({
                path: options.catalogDirectory,
                driver: session.driver,
                providerSessionId: session.providerSessionId,
            })
            options.haptic.notification('success')
            await options.onSuccess(recovered.session.id)
        } catch (error) {
            options.haptic.notification('error')
            options.setError(options.formatError(error))
        } finally {
            setIsRecovering(false)
        }
    }, [
        options.api,
        options.catalogDirectory,
        options.clearError,
        options.directory,
        options.formatError,
        options.haptic,
        options.isCatalogCurrent,
        options.onSuccess,
        options.selectedSession,
        options.setError,
    ])

    return {
        isRecovering,
        handleRecover,
        canRecover: Boolean(
            options.selectedSession &&
                options.directory &&
                options.isCatalogCurrent &&
                !options.isFormDisabled &&
                !isRecovering
        ),
    }
}

export function useRecoverLocalState(options: RecoverLocalStateOptions) {
    const [mode, setMode] = useState<NewSessionMode>(options.initialMode ?? 'start')
    const [recoverSearchQuery, setRecoverSearchQuery] = useState('')
    const [recoverDriverSelection, setRecoverDriverSelection] = useState<RecoverLocalDriverSelection>(
        RECOVER_LOCAL_DRIVER_SELECTION_NONE
    )
    useEffect(() => setMode(options.initialMode ?? 'start'), [options.initialMode])

    const catalog = useRecoverCatalog({
        api: options.api,
        mode,
        directory: options.directory,
        driverSelection: recoverDriverSelection,
        formatError: options.formatError,
    })
    const search = useRecoverSearch(catalog.catalog, recoverSearchQuery)
    const selection = useRecoverSelection(mode, search.filteredSearchEntries)

    const recoverAction = useRecoverAction({
        api: options.api,
        directory: options.directory,
        haptic: options.haptic,
        onSuccess: options.onSuccess,
        clearError: options.clearError,
        setError: options.setError,
        formatError: options.formatError,
        isFormDisabled: options.isFormDisabled,
        catalogDirectory: catalog.catalogDirectory,
        isCatalogCurrent: catalog.isCatalogCurrent,
        selectedSession: selection.selectedSession,
    })

    const handleSearchQueryChange = useCallback(
        (value: string) => {
            setRecoverSearchQuery(value)
            selection.clearSelection()
        },
        [selection.clearSelection]
    )

    const handleDriverSelectionChange = useCallback(
        (value: RecoverLocalDriverSelection) => {
            setRecoverDriverSelection(value)
            selection.clearSelection()
        },
        [selection.clearSelection]
    )

    return {
        mode,
        setMode,
        isRecovering: recoverAction.isRecovering,
        canRecover: recoverAction.canRecover,
        recoverActionLabel: options.t('newSession.recover.action'),
        handleRecover: recoverAction.handleRecover,
        panelProps: {
            sessions: search.filteredSessions,
            unavailableCapabilities: search.unavailableCapabilities,
            selectedSessionKey: selection.selectedKey,
            searchQuery: recoverSearchQuery,
            driverSelection: recoverDriverSelection,
            isLoading: catalog.isLoading,
            error: catalog.loadError,
            isDisabled: options.isFormDisabled,
            hasDirectory: Boolean(options.directory),
            onSearchQueryChange: handleSearchQueryChange,
            onDriverSelectionChange: handleDriverSelectionChange,
            onSelectSession: selection.setSelectedKey,
        },
    }
}

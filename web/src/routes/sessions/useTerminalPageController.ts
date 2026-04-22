import type { Terminal } from '@xterm/xterm'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTerminalSocket } from '@/hooks/useTerminalSocket'
import { createRandomId } from '@/lib/id'
import { applyModifierState, type ModifierState, shouldResetModifiers } from '@/routes/sessions/terminalQuickInput'

type UseTerminalPageControllerOptions = {
    baseUrl: string
    sessionActive: boolean
    sessionId: string
    token: string | null
}

type ExitInfo = {
    code: number | null
    signal: string | null
}

type UseTerminalPageControllerResult = {
    altActive: boolean
    ctrlActive: boolean
    exitInfo: ExitInfo | null
    handleModifierToggle: (modifier: 'ctrl' | 'alt') => void
    handleQuickInput: (sequence: string) => void
    handleResize: (cols: number, rows: number) => void
    handleTerminalMount: (terminal: Terminal) => void
    quickInputDisabled: boolean
    terminalContentReady: boolean
    terminalState: ReturnType<typeof useTerminalSocket>['state']
    writePlainInput: (text: string) => boolean
}

export function useTerminalPageController(options: UseTerminalPageControllerOptions): UseTerminalPageControllerResult {
    const { baseUrl, sessionActive, sessionId, token } = options
    const terminalId = useMemo(() => createRandomId(), [sessionId])
    const terminalRef = useRef<Terminal | null>(null)
    const inputDisposableRef = useRef<{ dispose: () => void } | null>(null)
    const connectOnceRef = useRef(false)
    const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null)
    const modifierStateRef = useRef<ModifierState>({ ctrl: false, alt: false })
    const [exitInfo, setExitInfo] = useState<ExitInfo | null>(null)
    const [terminalContentReady, setTerminalContentReady] = useState(false)
    const [ctrlActive, setCtrlActive] = useState(false)
    const [altActive, setAltActive] = useState(false)

    const {
        state: terminalState,
        connect,
        write,
        resize,
        disconnect,
        onOutput,
        onExit,
    } = useTerminalSocket({
        token: token ?? '',
        sessionId,
        terminalId,
        baseUrl,
    })

    useEffect(() => {
        onOutput((data) => {
            if (data.length > 0) {
                setTerminalContentReady(true)
            }
            terminalRef.current?.write(data)
        })
    }, [onOutput])

    useEffect(() => {
        onExit((code, signal) => {
            setTerminalContentReady(true)
            setExitInfo({ code, signal })
            terminalRef.current?.write(`\r\n[process exited${code !== null ? ` with code ${code}` : ''}]`)
        })
    }, [onExit])

    useEffect(() => {
        modifierStateRef.current = { ctrl: ctrlActive, alt: altActive }
    }, [altActive, ctrlActive])

    const resetModifiers = useCallback(() => {
        setCtrlActive(false)
        setAltActive(false)
    }, [])

    const dispatchSequence = useCallback(
        (sequence: string, modifierState: ModifierState) => {
            write(applyModifierState(sequence, modifierState))

            if (shouldResetModifiers(sequence, modifierState)) {
                resetModifiers()
            }
        },
        [resetModifiers, write]
    )

    const handleTerminalMount = useCallback(
        (terminal: Terminal) => {
            terminalRef.current = terminal
            inputDisposableRef.current?.dispose()
            inputDisposableRef.current = terminal.onData((data) => {
                dispatchSequence(data, modifierStateRef.current)
            })
        },
        [dispatchSequence]
    )

    const handleResize = useCallback(
        (cols: number, rows: number) => {
            lastSizeRef.current = { cols, rows }

            if (!sessionActive) {
                return
            }

            if (!connectOnceRef.current) {
                connectOnceRef.current = true
                connect(cols, rows)
                return
            }

            resize(cols, rows)
        },
        [connect, resize, sessionActive]
    )

    useEffect(() => {
        if (!sessionActive || connectOnceRef.current || !lastSizeRef.current) {
            return
        }

        connectOnceRef.current = true
        connect(lastSizeRef.current.cols, lastSizeRef.current.rows)
    }, [connect, sessionActive])

    useEffect(() => {
        connectOnceRef.current = false
        setExitInfo(null)
        setTerminalContentReady(false)
        disconnect()
    }, [disconnect, sessionId])

    useEffect(() => {
        return () => {
            inputDisposableRef.current?.dispose()
            connectOnceRef.current = false
            disconnect()
        }
    }, [disconnect])

    useEffect(() => {
        if (!sessionActive) {
            disconnect()
            connectOnceRef.current = false
        }
    }, [disconnect, sessionActive])

    useEffect(() => {
        if (terminalState.status === 'connecting' || terminalState.status === 'connected') {
            setExitInfo(null)
        }
    }, [terminalState.status])

    const quickInputDisabled = !sessionActive || terminalState.status !== 'connected'

    const writePlainInput = useCallback(
        (text: string) => {
            if (!text || quickInputDisabled) {
                return false
            }

            write(text)
            resetModifiers()
            terminalRef.current?.focus()
            return true
        },
        [quickInputDisabled, resetModifiers, write]
    )

    const handleQuickInput = useCallback(
        (sequence: string) => {
            if (quickInputDisabled) {
                return
            }

            dispatchSequence(sequence, { ctrl: ctrlActive, alt: altActive })
            terminalRef.current?.focus()
        },
        [altActive, ctrlActive, dispatchSequence, quickInputDisabled]
    )

    const handleModifierToggle = useCallback(
        (modifier: 'ctrl' | 'alt') => {
            if (quickInputDisabled) {
                return
            }

            if (modifier === 'ctrl') {
                setCtrlActive((value) => !value)
                setAltActive(false)
            } else {
                setAltActive((value) => !value)
                setCtrlActive(false)
            }

            terminalRef.current?.focus()
        },
        [quickInputDisabled]
    )

    return {
        altActive,
        ctrlActive,
        exitInfo,
        handleModifierToggle,
        handleQuickInput,
        handleResize,
        handleTerminalMount,
        quickInputDisabled,
        terminalContentReady,
        terminalState,
        writePlainInput,
    }
}

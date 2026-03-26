import { memo, useEffect, useRef } from 'react'
import type { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { ensureBuiltinFontLoaded, getFontProvider } from '@/lib/terminalFont'

type TerminalViewProps = {
    onMount?: (terminal: Terminal) => void
    onResize?: (cols: number, rows: number) => void
    className?: string
}

type LoadedTerminalModules = {
    Terminal: typeof import('@xterm/xterm').Terminal
    FitAddon: typeof import('@xterm/addon-fit').FitAddon
    WebLinksAddon: typeof import('@xterm/addon-web-links').WebLinksAddon
}

let terminalModulesPromise: Promise<LoadedTerminalModules> | null = null

function loadTerminalModules(): Promise<LoadedTerminalModules> {
    if (!terminalModulesPromise) {
        terminalModulesPromise = Promise.all([
            import('@xterm/xterm'),
            import('@xterm/addon-fit'),
            import('@xterm/addon-web-links'),
        ]).then(([xterm, fit, webLinks]) => ({
            Terminal: xterm.Terminal,
            FitAddon: fit.FitAddon,
            WebLinksAddon: webLinks.WebLinksAddon,
        }))
    }

    return terminalModulesPromise
}

function resolveThemeColors(): { background: string; foreground: string; selectionBackground: string } {
    const styles = getComputedStyle(document.documentElement)
    const background = styles.getPropertyValue('--app-bg').trim() || '#000000'
    const foreground = styles.getPropertyValue('--app-fg').trim() || '#ffffff'
    const selectionBackground = styles.getPropertyValue('--app-subtle-bg').trim() || 'rgba(255, 255, 255, 0.2)'
    return { background, foreground, selectionBackground }
}

function TerminalViewComponent(props: TerminalViewProps) {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const onMountRef = useRef(props.onMount)
    const onResizeRef = useRef(props.onResize)

    useEffect(() => {
        onMountRef.current = props.onMount
    }, [props.onMount])

    useEffect(() => {
        onResizeRef.current = props.onResize
    }, [props.onResize])

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const abortController = new AbortController()
        let cleanup: (() => void) | null = null

        void loadTerminalModules().then(async ({ Terminal, FitAddon, WebLinksAddon }) => {
            if (abortController.signal.aborted) {
                return
            }

            const fontProvider = getFontProvider()
            const { background, foreground, selectionBackground } = resolveThemeColors()
            const terminal = new Terminal({
                cursorBlink: true,
                fontFamily: fontProvider.getFontFamily(),
                fontSize: 13,
                theme: {
                    background,
                    foreground,
                    cursor: foreground,
                    selectionBackground
                },
                convertEol: true,
                customGlyphs: true
            })

            const fitAddon = new FitAddon()
            const webLinksAddon = new WebLinksAddon()
            terminal.loadAddon(fitAddon)
            terminal.loadAddon(webLinksAddon)
            terminal.open(container)

            const observer = new ResizeObserver(() => {
                requestAnimationFrame(() => {
                    fitAddon.fit()
                    onResizeRef.current?.(terminal.cols, terminal.rows)
                })
            })
            observer.observe(container)

            const refreshFont = (forceRemeasure = false) => {
                if (abortController.signal.aborted) {
                    return
                }

                const nextFamily = fontProvider.getFontFamily()
                if (forceRemeasure && terminal.options.fontFamily === nextFamily) {
                    terminal.options.fontFamily = `${nextFamily}, "__viby_font_refresh__"`
                    requestAnimationFrame(() => {
                        if (abortController.signal.aborted) {
                            return
                        }
                        terminal.options.fontFamily = nextFamily
                        if (terminal.rows > 0) {
                            terminal.refresh(0, terminal.rows - 1)
                        }
                        fitAddon.fit()
                        onResizeRef.current?.(terminal.cols, terminal.rows)
                    })
                    return
                }

                terminal.options.fontFamily = nextFamily
                if (terminal.rows > 0) {
                    terminal.refresh(0, terminal.rows - 1)
                }
                fitAddon.fit()
                onResizeRef.current?.(terminal.cols, terminal.rows)
            }

            const loaded = await ensureBuiltinFontLoaded()
            if (loaded) {
                refreshFont(true)
            }

            requestAnimationFrame(() => {
                fitAddon.fit()
                onResizeRef.current?.(terminal.cols, terminal.rows)
            })
            onMountRef.current?.(terminal)

            cleanup = () => {
                observer.disconnect()
                fitAddon.dispose()
                webLinksAddon.dispose()
                terminal.dispose()
            }
        })

        return () => {
            abortController.abort()
            cleanup?.()
        }
    }, [])

    return (
        <div
            ref={containerRef}
            className={`h-full w-full ${props.className ?? ''}`}
        />
    )
}

export const TerminalView = memo(TerminalViewComponent)
TerminalView.displayName = 'TerminalView'

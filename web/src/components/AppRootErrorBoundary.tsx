import React from 'react'
import { Button } from '@/components/ui/button'
import { finalizeBootShell } from '@/lib/appRecovery'
import { reportWebRuntimeError } from '@/lib/runtimeDiagnostics'

type AppRootErrorBoundaryState = { error: Error | null }

type AppRootErrorBoundaryProps = { children: React.ReactNode }

function isChineseLocale(): boolean {
    return globalThis.navigator?.languages?.some((language) => language.toLowerCase().startsWith('zh')) ?? false
}

function copy() {
    if (isChineseLocale()) {
        return { title: '页面需要刷新', body: '连接状态已失效。刷新后会自动接回。', action: '刷新' }
    }
    return { title: 'Refresh needed', body: 'The connection state expired. Refresh to reconnect.', action: 'Refresh' }
}

export function AppRootFailureSurface(): React.JSX.Element {
    const text = copy()
    return (
        <main className="ds-connection-page" role="alert">
            <section className="ds-connection-panel">
                <h1 className="ds-connection-title">{text.title}</h1>
                <p className="ds-connection-description">{text.body}</p>
                <Button type="button" onClick={() => window.location.reload()}>
                    {text.action}
                </Button>
            </section>
        </main>
    )
}

export class AppRootErrorBoundary extends React.Component<AppRootErrorBoundaryProps, AppRootErrorBoundaryState> {
    state: AppRootErrorBoundaryState = { error: null }

    static getDerivedStateFromError(error: Error): AppRootErrorBoundaryState {
        return { error }
    }

    componentDidCatch(error: Error): void {
        reportWebRuntimeError('App root render failed.', error)
        finalizeBootShell()
    }

    render(): React.ReactNode {
        if (!this.state.error) return this.props.children
        return <AppRootFailureSurface />
    }
}

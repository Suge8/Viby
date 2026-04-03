type ManagedChildLabel = 'hub' | 'web'

export type UnexpectedChildExitOutcome = {
    exitCode: number
    message: string
}

function resolveSupervisorExitCode(code: number | null): number {
    return typeof code === 'number' && code !== 0 ? code : 1
}

export function formatUnexpectedChildExitMessage(
    label: ManagedChildLabel,
    details: string
): string {
    return `[${label}] exited (${details}). Shutting down dev:remote so the supervisor can restart the full stack.`
}

export function buildUnexpectedChildExitOutcome(
    label: ManagedChildLabel,
    details: string,
    code: number | null
): UnexpectedChildExitOutcome {
    return {
        exitCode: resolveSupervisorExitCode(code),
        message: formatUnexpectedChildExitMessage(label, details)
    }
}

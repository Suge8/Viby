export function RemotePairingHydrateSkeleton() {
    return (
        <div className="min-h-dvh bg-background text-foreground">
            <div className="h-1.5 w-full overflow-hidden bg-muted">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
            </div>
            <div className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-4 p-4">
                <div className="h-12 rounded-2xl bg-muted" />
                <div className="min-h-0 flex-1 rounded-3xl bg-muted" />
            </div>
        </div>
    )
}

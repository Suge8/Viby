import { Button } from '@/components/ui/button'

type RemoteReconnectNoticeActionProps = {
    copyLabel: string
    onCopyDiagnostics?: () => void
    onStop?: () => void
    stopLabel: string
}

export function RemoteReconnectNoticeAction(props: RemoteReconnectNoticeActionProps): React.JSX.Element {
    return (
        <div className="flex items-center gap-1">
            {props.onCopyDiagnostics ? (
                <Button type="button" size="sm" variant="ghost" onClick={props.onCopyDiagnostics}>
                    {props.copyLabel}
                </Button>
            ) : null}
            {props.onStop ? (
                <Button type="button" size="sm" variant="ghost" onClick={props.onStop}>
                    {props.stopLabel}
                </Button>
            ) : null}
        </div>
    )
}

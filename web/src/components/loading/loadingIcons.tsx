import { FolderOpen, LoaderCircle, MessageCircleMore, Terminal } from 'lucide-react'
import { BrandMarkIcon } from '@/components/icons'

type LoadingIconProps = {
    className?: string
}

export function LoadingBrandMarkIcon(props: LoadingIconProps): React.JSX.Element {
    return <BrandMarkIcon className={props.className} />
}

export function LoadingSpinnerIcon(props: LoadingIconProps): React.JSX.Element {
    return <LoaderCircle aria-hidden="true" className={props.className} strokeWidth={2.1} />
}

export function LoadingWorkspaceIcon(props: LoadingIconProps): React.JSX.Element {
    return <LoadingBrandMarkIcon className={props.className} />
}

export function LoadingSessionIcon(props: LoadingIconProps): React.JSX.Element {
    return <MessageCircleMore aria-hidden="true" className={props.className} strokeWidth={2.1} />
}

export function LoadingFilesIcon(props: LoadingIconProps): React.JSX.Element {
    return <FolderOpen aria-hidden="true" className={props.className} strokeWidth={2.1} />
}

export function LoadingTerminalIcon(props: LoadingIconProps): React.JSX.Element {
    return <Terminal aria-hidden="true" className={props.className} strokeWidth={2.1} />
}

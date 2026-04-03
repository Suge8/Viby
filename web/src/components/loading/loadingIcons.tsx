import type { ComponentProps } from 'react'
import { FolderOpen, LoaderCircle, MessageCircleMore, Terminal } from 'lucide-react'
import { BrandMarkIcon } from '@/components/icons'

type LoadingIconProps = ComponentProps<typeof LoaderCircle>

export function LoadingBrandMarkIcon(props: LoadingIconProps): React.JSX.Element {
    return <BrandMarkIcon {...props} />
}

export function LoadingSpinnerIcon(props: LoadingIconProps): React.JSX.Element {
    return <LoaderCircle {...props} strokeWidth={2.1} />
}

export function LoadingWorkspaceIcon(props: LoadingIconProps): React.JSX.Element {
    return <LoadingBrandMarkIcon {...props} />
}

export function LoadingSessionIcon(props: LoadingIconProps): React.JSX.Element {
    return <MessageCircleMore {...props} strokeWidth={2.1} />
}

export function LoadingFilesIcon(props: LoadingIconProps): React.JSX.Element {
    return <FolderOpen {...props} strokeWidth={2.1} />
}

export function LoadingTerminalIcon(props: LoadingIconProps): React.JSX.Element {
    return <Terminal {...props} strokeWidth={2.1} />
}

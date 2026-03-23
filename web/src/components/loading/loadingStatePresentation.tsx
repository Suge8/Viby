import type { ComponentType, ReactNode } from 'react'
import {
    FolderOpenIcon,
    LockIcon,
    MessageSquareIcon,
    TerminalIcon,
    WorkspaceIcon,
} from '@/components/icons'

export type LoadingStateKind = 'authorizing' | 'workspace' | 'session' | 'files' | 'terminal'

type LoadingStatePresentationOptions = {
    kind: LoadingStateKind
    t: (key: string) => string
    withDescription?: boolean
}

type LoadingStatePresentation = {
    label: string
    description?: string
    icon: ReactNode
}

type LoadingStateDefinition = {
    labelKey: string
    descriptionKey?: string
    Icon: ComponentType<{ className?: string }>
}

const LOADING_STATE_DEFINITIONS: Record<LoadingStateKind, LoadingStateDefinition> = {
    authorizing: {
        labelKey: 'authorizing',
        descriptionKey: 'loading.authorizing.description',
        Icon: LockIcon,
    },
    workspace: {
        labelKey: 'loading.workspace',
        descriptionKey: 'loading.workspace.description',
        Icon: WorkspaceIcon,
    },
    session: {
        labelKey: 'loading.session',
        Icon: MessageSquareIcon,
    },
    files: {
        labelKey: 'loading.files',
        Icon: FolderOpenIcon,
    },
    terminal: {
        labelKey: 'loading.terminal',
        Icon: TerminalIcon,
    },
}

export function getLoadingStatePresentation(options: LoadingStatePresentationOptions): LoadingStatePresentation {
    const definition = LOADING_STATE_DEFINITIONS[options.kind]
    const description = options.withDescription === false || !definition.descriptionKey
        ? undefined
        : options.t(definition.descriptionKey)

    return {
        label: options.t(definition.labelKey),
        description,
        icon: <definition.Icon className="h-5 w-5" />,
    }
}

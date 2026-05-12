import type { ReactNode } from 'react'
import { STAGE_BRAND_MARK_NEUTRAL_TONE_CLASS_NAME, StageBrandMark } from '@/components/StageBrandMark'

const WORKSPACE_LOADING_BRAND_MARK_CLASS_NAME = `ds-stage-empty-icon h-20 w-20 ${STAGE_BRAND_MARK_NEUTRAL_TONE_CLASS_NAME}`

export type LoadingStateKind = 'workspace' | 'runtime'

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
    icon: ReactNode
}

const LOADING_STATE_DEFINITIONS: Record<LoadingStateKind, LoadingStateDefinition> = {
    workspace: {
        labelKey: 'loading.workspace',
        descriptionKey: 'loading.workspace.description',
        icon: <StageBrandMark className={WORKSPACE_LOADING_BRAND_MARK_CLASS_NAME} />,
    },
    runtime: {
        labelKey: 'loading.runtime',
        icon: <StageBrandMark className={WORKSPACE_LOADING_BRAND_MARK_CLASS_NAME} />,
    },
}

export function getLoadingStatePresentation(options: LoadingStatePresentationOptions): LoadingStatePresentation {
    const definition = LOADING_STATE_DEFINITIONS[options.kind]
    const description =
        options.withDescription === false || !definition.descriptionKey
            ? undefined
            : options.t(definition.descriptionKey)

    return {
        label: options.t(definition.labelKey),
        description,
        icon: definition.icon,
    }
}

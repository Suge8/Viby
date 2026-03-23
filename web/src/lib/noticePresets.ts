import type { AppNoticeTone } from '@/components/AppNotice'

type TranslationFn = (key: string, params?: Record<string, string | number>) => string

export type NoticePresetKey =
    | 'genericError'
    | 'genericWarning'
    | 'genericInfo'
    | 'loginError'
    | 'loginServerError'
    | 'newSessionLoadMachinesError'
    | 'newSessionCreateError'
    | 'newSessionRunnerError'
    | 'dialogError'
    | 'renameError'
    | 'toolRequestFailed'
    | 'toolPermissionDenied'
    | 'toolCanceled'

export type NoticePreset = {
    tone: AppNoticeTone
    title: string
}

export function getNoticePreset(key: NoticePresetKey, t: TranslationFn): NoticePreset {
    switch (key) {
        case 'genericWarning':
            return { tone: 'warning', title: t('notice.warning.title') }
        case 'genericInfo':
            return { tone: 'info', title: t('notice.info.title') }
        case 'loginError':
            return { tone: 'danger', title: t('login.error.title') }
        case 'loginServerError':
            return { tone: 'danger', title: t('login.server.error.title') }
        case 'newSessionLoadMachinesError':
            return { tone: 'danger', title: t('newSession.error.loadMachinesTitle') }
        case 'newSessionCreateError':
            return { tone: 'danger', title: t('newSession.error.createTitle') }
        case 'newSessionRunnerError':
            return { tone: 'danger', title: t('newSession.error.runnerTitle') }
        case 'dialogError':
            return { tone: 'danger', title: t('dialog.error.title') }
        case 'renameError':
            return { tone: 'danger', title: t('dialog.rename.errorTitle') }
        case 'toolRequestFailed':
            return { tone: 'danger', title: t('tool.requestFailed.title') }
        case 'toolPermissionDenied':
            return { tone: 'warning', title: t('tool.permissionDenied.title') }
        case 'toolCanceled':
            return { tone: 'warning', title: t('tool.canceled.title') }
        case 'genericError':
        default:
            return { tone: 'danger', title: t('notice.error.title') }
    }
}

import type { JSX } from 'react'
import { ConnectingProgressRail } from '@/components/loading/ConnectingProgressRail'
import { joinClassNames } from '@/components/loading/loadingClassName'
import { STAGE_BRAND_MARK_NEUTRAL_TONE_CLASS_NAME, StageBrandMark } from '@/components/StageBrandMark'
import {
    getRemoteConnectingPhaseProgress,
    getRemoteConnectingPhaseStepKey,
    type RemoteConnectingPhase,
} from '@/lib/remoteConnectingPhase'
import { useTranslation } from '@/lib/use-translation'

const CONNECTING_BRAND_MARK_CLASS_NAME = `ds-connection-brand-mark ${STAGE_BRAND_MARK_NEUTRAL_TONE_CLASS_NAME}`

type RemoteConnectingScreenProps = {
    phase: RemoteConnectingPhase
    className?: string
}

export function RemoteConnectingScreen(props: RemoteConnectingScreenProps): JSX.Element {
    const { t } = useTranslation()
    const progress = getRemoteConnectingPhaseProgress(props.phase)

    return (
        <main
            className={joinClassNames('ds-connection-page', props.className)}
            role="status"
            aria-live="polite"
            aria-busy="true"
        >
            <section className="ds-connection-panel ds-connecting-panel">
                <StageBrandMark
                    className={CONNECTING_BRAND_MARK_CLASS_NAME}
                    markClassName="ds-connection-brand-glyph"
                />
                <h1 className="ds-connection-title ds-connecting-title">{t('remotePairing.connecting.title')}</h1>
                <ConnectingProgressRail progress={progress} className="ds-connecting-progress-rail" />
                <p className="ds-connecting-step" key={props.phase}>
                    {t(getRemoteConnectingPhaseStepKey(props.phase))}
                </p>
            </section>
        </main>
    )
}

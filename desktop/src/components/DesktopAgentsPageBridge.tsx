import type { JSX } from 'react'
import type { useAgentAvailability } from '@/hooks/useAgentAvailability'
import type { useAgentConfig } from '@/hooks/useAgentConfig'
import type { DesktopToastTone } from '@/hooks/useDesktopToast'
import type { DesktopCopy } from '@/lib/desktopCopy'
import type { DesktopLanguage } from '@/lib/desktopPreferences'
import { COPY_FEEDBACK_DURATION_MS } from '@/lib/desktopShellModel'
import { CodingAgentsPage } from './CodingAgentsPage'

type DesktopAgentsPageBridgeProps = {
    agentAvailability: ReturnType<typeof useAgentAvailability>
    agentConfig: ReturnType<typeof useAgentConfig>
    copy: DesktopCopy
    language: DesktopLanguage
    onOpenUrl(url: string): void
    showToast(message: string, durationMs?: number, tone?: DesktopToastTone): void
}

function showResultToast(
    props: Pick<DesktopAgentsPageBridgeProps, 'showToast'>,
    ok: boolean,
    successMessage: string,
    failureMessage: string
): void {
    props.showToast(ok ? successMessage : failureMessage, COPY_FEEDBACK_DURATION_MS, ok ? 'success' : 'default')
}

export function DesktopAgentsPageBridge(props: DesktopAgentsPageBridgeProps): JSX.Element {
    const { agentAvailability, agentConfig, copy } = props
    return (
        <CodingAgentsPage
            agents={agentAvailability.agents}
            capabilities={agentAvailability.capabilities}
            configError={agentConfig.error}
            configLoading={agentConfig.loading}
            configOpeningDriver={agentConfig.openingDriver}
            configResponse={agentConfig.response}
            configRestoringDriver={agentConfig.restoringDriver}
            configSavingDriver={agentConfig.savingDriver}
            copy={copy}
            error={agentAvailability.error}
            language={props.language}
            loading={agentAvailability.loading}
            refreshing={agentAvailability.refreshing}
            onLoadAgentCapability={agentAvailability.loadAgentCapability}
            onOpenUrl={props.onOpenUrl}
            onRefresh={agentAvailability.refresh}
            onOpenAgentConfig={async (driver) => {
                const opened = await agentConfig.open({ driver })
                showResultToast(props, opened, copy.agentConfigOpened, copy.agentConfigOpenFailed)
                return opened
            }}
            onRestoreAgentConfig={async (request) => {
                const restored = await agentConfig.restore(request)
                showResultToast(props, Boolean(restored), copy.agentConfigRestored, copy.agentConfigRestoreFailed)
                return Boolean(restored)
            }}
            onSaveAgentConfig={async (request) => {
                const saved = await agentConfig.save(request)
                showResultToast(props, Boolean(saved), copy.agentConfigSaved, copy.agentConfigSaveFailed)
                return Boolean(saved)
            }}
        />
    )
}

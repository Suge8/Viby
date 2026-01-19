import { useTranslation } from '@/lib/use-translation'
import type { ConversationStatus } from '@/realtime/types'

interface VoiceStatusBarProps {
    status: ConversationStatus
    onStop: () => void
    micMuted?: boolean
    onMicToggle?: () => void
}

function MicrophoneIcon(props: { muted?: boolean }) {
    if (props.muted) {
        return (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <line x1="2" x2="22" y1="2" y2="22" />
                <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
                <path d="M5 10v2a7 7 0 0 0 12 5" />
                <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
                <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
        )
    }

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
        </svg>
    )
}

function StatusDot(props: { color: 'yellow' | 'green' | 'gray' | 'red'; pulsing?: boolean }) {
    const colorClasses = {
        yellow: 'bg-yellow-500',
        green: 'bg-emerald-500',
        gray: 'bg-gray-400',
        red: 'bg-red-500'
    }

    const pulsingColorClasses = {
        yellow: 'bg-yellow-400',
        green: 'bg-emerald-400',
        gray: 'bg-gray-300',
        red: 'bg-red-400'
    }

    if (props.pulsing) {
        return (
            <span className="relative flex h-2 w-2">
                <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${pulsingColorClasses[props.color]} opacity-75`}></span>
                <span className={`relative inline-flex h-2 w-2 rounded-full ${colorClasses[props.color]}`}></span>
            </span>
        )
    }

    return <span className={`inline-flex h-2 w-2 rounded-full ${colorClasses[props.color]}`}></span>
}

export function VoiceStatusBar({ status, onStop, micMuted, onMicToggle }: VoiceStatusBarProps) {
    const { t } = useTranslation()

    if (status === 'disconnected') {
        return null
    }

    // Determine status dot appearance
    let dotColor: 'yellow' | 'green' | 'gray' | 'red' = 'green'
    let dotPulsing = false

    if (status === 'connecting') {
        dotColor = 'yellow'
        dotPulsing = true
    } else if (status === 'error') {
        dotColor = 'red'
    } else if (micMuted) {
        dotColor = 'gray'
    }

    // Determine status text
    const statusText = status === 'connecting'
        ? t('voice.connecting')
        : status === 'error'
            ? t('voice.error')
            : micMuted
                ? t('voice.muted')
                : t('voice.active')

    return (
        <div className="flex h-8 items-center justify-between rounded-lg bg-[var(--app-secondary-bg)] px-3">
            {/* Left section: status dot + mic icon + status text */}
            <button
                type="button"
                onClick={onStop}
                className="flex flex-1 items-center gap-1.5 text-[var(--app-fg)] transition-opacity hover:opacity-70"
            >
                <StatusDot color={dotColor} pulsing={dotPulsing} />
                <MicrophoneIcon muted={micMuted} />
                <span className="text-sm font-medium">{statusText}</span>
            </button>

            {/* Right section: mute button + end button */}
            <div className="flex items-center gap-3">
                {status === 'connected' && onMicToggle && (
                    <button
                        type="button"
                        onClick={onMicToggle}
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[var(--app-fg)] transition-opacity hover:opacity-70"
                    >
                        <MicrophoneIcon muted={micMuted} />
                        <span>{micMuted ? t('voice.unmute') : t('voice.mute')}</span>
                    </button>
                )}

                <button
                    type="button"
                    onClick={onStop}
                    className="rounded px-2 py-1 text-xs font-medium text-[var(--app-fg)] transition-opacity hover:opacity-70"
                >
                    {t('voice.end')}
                </button>
            </div>
        </div>
    )
}

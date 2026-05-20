import type { JSX } from 'react'
import { Spinner } from '@/components/Spinner'

export function ReconnectingNoticeIcon(): JSX.Element {
    return <Spinner size="sm" label={null} className="text-current" />
}

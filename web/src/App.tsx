import type { JSX } from 'react'
import { AppController } from '@/components/AppController'
import { FloatingNoticeViewport } from '@/components/FloatingNoticeViewport'
import { NoticeProvider } from '@/lib/notice-center'

export function App(): JSX.Element {
    return (
        <NoticeProvider>
            <AppController />
            <FloatingNoticeViewport />
        </NoticeProvider>
    )
}

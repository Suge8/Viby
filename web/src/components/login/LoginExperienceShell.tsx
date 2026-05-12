import type { JSX, ReactNode } from 'react'
import { STAGE_BRAND_MARK_NEUTRAL_TONE_CLASS_NAME, StageBrandMark } from '@/components/StageBrandMark'
import '@/styles/design-login-landing.css'

type Translate = (key: string, params?: Record<string, string | number>) => string

type LoginExperienceShellProps = {
    t: Translate
    languageSwitcher: ReactNode
    loginPanel: ReactNode
    footer: ReactNode
}

export function LoginExperienceShell(props: LoginExperienceShellProps): JSX.Element {
    return (
        <main className="viby-login-page" data-testid="login-access-shell">
            <section className="viby-login-access" aria-label={props.t('login.title')}>
                <header className="viby-login-access__header">
                    <div className="viby-login-access__brand">
                        <StageBrandMark
                            className={`h-11 w-11 ${STAGE_BRAND_MARK_NEUTRAL_TONE_CLASS_NAME}`}
                            markClassName="h-7 w-7"
                        />
                    </div>
                    {props.languageSwitcher}
                </header>
                {props.loginPanel}
                <footer className="viby-login-footer">{props.footer}</footer>
            </section>
        </main>
    )
}

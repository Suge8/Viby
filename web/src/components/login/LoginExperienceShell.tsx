import { ArrowRight, ArrowUpRight, FolderKanban, ShieldCheck, Smartphone, TerminalSquare } from 'lucide-react'
import { m } from 'motion/react'
import type { JSX, ReactNode } from 'react'
import { MotionReveal, MotionStaggerGroup, MotionStaggerItem } from '@/components/motion/motionPrimitives'
import { STAGE_BRAND_MARK_NEUTRAL_TONE_CLASS_NAME, StageBrandMark } from '@/components/StageBrandMark'
import { Button } from '@/components/ui/button'
import '@/styles/design-login-landing.css'

type Translate = (key: string, params?: Record<string, string | number>) => string

type LoginExperienceShellProps = {
    t: Translate
    languageSwitcher: ReactNode
    loginPanel: ReactNode
    footer: ReactNode
}

const PROJECT_URL = 'https://github.com/Suge8/Viby'

const SIGNAL_ITEMS = [
    { icon: Smartphone, labelKey: 'login.signal.remote' },
    { icon: ShieldCheck, labelKey: 'login.signal.approval' },
    { icon: FolderKanban, labelKey: 'login.signal.files' },
    { icon: TerminalSquare, labelKey: 'login.signal.terminal' },
] as const

const CAPABILITY_ITEMS = [
    { titleKey: 'login.capability.continuity.title', bodyKey: 'login.capability.continuity.body' },
    { titleKey: 'login.capability.review.title', bodyKey: 'login.capability.review.body' },
    { titleKey: 'login.capability.control.title', bodyKey: 'login.capability.control.body' },
] as const

const PROOF_ITEMS = [
    { valueKey: 'login.proof.local.value', labelKey: 'login.proof.local.label' },
    { valueKey: 'login.proof.session.value', labelKey: 'login.proof.session.label' },
    { valueKey: 'login.proof.surface.value', labelKey: 'login.proof.surface.label' },
] as const

const FLOW_ITEMS = [
    { index: '01', titleKey: 'login.flow.launch.title', bodyKey: 'login.flow.launch.body' },
    { index: '02', titleKey: 'login.flow.join.title', bodyKey: 'login.flow.join.body' },
    { index: '03', titleKey: 'login.flow.continue.title', bodyKey: 'login.flow.continue.body' },
] as const

function ProductVisual(props: { t: Translate }): JSX.Element {
    const { t } = props

    return (
        <MotionReveal className="viby-login-stage" delay={0.04} y={18}>
            <div className="viby-login-stage__frame viby-login-stage__frame--desktop">
                <div className="viby-login-stage__frame-bar">
                    <span>{t('login.visual.desktopLabel')}</span>
                    <strong>{t('login.visual.desktopState')}</strong>
                </div>
                <div className="viby-login-stage__code">
                    <div className="viby-login-stage__code-line">
                        <span>$</span>
                        <strong> viby hub</strong>
                    </div>
                    <div className="viby-login-stage__code-line viby-login-stage__code-line--muted">
                        {t('login.visual.line.session')}
                    </div>
                    <div className="viby-login-stage__code-line viby-login-stage__code-line--muted">
                        {t('login.visual.line.waiting')}
                    </div>
                </div>
                <div className="viby-login-stage__desktop-footer">
                    <span>{t('login.visual.desktopFootnote')}</span>
                    <span>{t('login.visual.desktopFootnote2')}</span>
                </div>
            </div>

            <m.div
                className="viby-login-stage__frame viby-login-stage__frame--mobile"
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 5.2, repeat: Infinity, ease: 'easeInOut' }}
            >
                <div className="viby-login-stage__phone-top" />
                <div className="viby-login-stage__frame-bar">
                    <span>{t('login.visual.mobileLabel')}</span>
                    <strong>{t('login.visual.mobileState')}</strong>
                </div>
                <div className="viby-login-stage__message viby-login-stage__message--subtle">
                    {t('login.visual.mobileMessage.user')}
                </div>
                <div className="viby-login-stage__message">{t('login.visual.mobileMessage.assistant')}</div>
                <div className="viby-login-stage__mobile-actions">
                    <span>{t('login.signal.approval')}</span>
                    <span>{t('login.signal.files')}</span>
                </div>
            </m.div>

            <div className="viby-login-stage__badge viby-login-stage__badge--top">{t('login.visual.badge')}</div>
            <div className="viby-login-stage__badge viby-login-stage__badge--bottom">{t('login.visual.badge2')}</div>
        </MotionReveal>
    )
}

export function LoginExperienceShell(props: LoginExperienceShellProps): JSX.Element {
    const { t } = props

    return (
        <div className="viby-login-page" data-testid="login-marketing-shell">
            <div className="viby-login-page__noise" aria-hidden="true" />

            <div className="viby-login-page__scroller">
                <header className="viby-login-header">
                    <div className="viby-login-header__inner">
                        <div className="viby-login-header__brand">
                            <StageBrandMark
                                className={`h-11 w-11 ${STAGE_BRAND_MARK_NEUTRAL_TONE_CLASS_NAME}`}
                                markClassName="h-7 w-7"
                            />
                            <div>
                                <div className="viby-login-header__brand-name">{t('login.title')}</div>
                                <div className="viby-login-header__brand-copy">{t('login.header.tagline')}</div>
                            </div>
                        </div>
                        <div className="viby-login-header__actions">
                            <Button asChild size="sm" variant="ghost" className="viby-login-header__repo">
                                <a href={PROJECT_URL} target="_blank" rel="noreferrer">
                                    {t('login.hero.repo')}
                                    <ArrowUpRight className="h-4 w-4" />
                                </a>
                            </Button>
                            {props.languageSwitcher}
                        </div>
                    </div>
                </header>

                <main className="viby-login-main">
                    <section className="viby-login-hero">
                        <MotionReveal className="viby-login-hero__copy" y={20}>
                            <div className="viby-login-hero__eyebrow">{t('login.hero.eyebrow')}</div>
                            <h1>{t('login.hero.title')}</h1>
                            <p className="viby-login-hero__body">{t('login.hero.body')}</p>
                            <div className="viby-login-hero__actions">
                                <Button asChild size="lg" className="viby-login-hero__primary">
                                    <a href="#login-access">
                                        {t('login.hero.primary')}
                                        <ArrowRight className="h-4 w-4" />
                                    </a>
                                </Button>
                            </div>
                            <MotionStaggerGroup className="viby-login-signal-list">
                                {SIGNAL_ITEMS.map(({ icon: Icon, labelKey }) => (
                                    <MotionStaggerItem key={labelKey} y={12}>
                                        <div className="viby-login-signal-pill">
                                            <Icon className="h-4 w-4" />
                                            <span>{t(labelKey)}</span>
                                        </div>
                                    </MotionStaggerItem>
                                ))}
                            </MotionStaggerGroup>
                        </MotionReveal>

                        <div className="viby-login-hero__side">
                            <ProductVisual t={t} />
                            <MotionReveal className="viby-login-hero__meta" delay={0.08} y={16}>
                                <div>{t('login.meta.primary')}</div>
                                <div>{t('login.meta.secondary')}</div>
                            </MotionReveal>
                        </div>
                    </section>

                    <section className="viby-login-dock">
                        <MotionReveal className="viby-login-dock__intro" y={16}>
                            <div className="viby-login-dock__label">{t('login.panel.badge')}</div>
                            <h2>{t('login.panel.title')}</h2>
                            <p className="viby-login-dock__body">{t('login.panel.body')}</p>
                        </MotionReveal>
                        <div id="login-access" className="viby-login-dock__panel">
                            {props.loginPanel}
                        </div>
                    </section>

                    <section className="viby-login-proof">
                        <MotionStaggerGroup className="viby-login-proof__grid">
                            {PROOF_ITEMS.map(({ labelKey, valueKey }) => (
                                <MotionStaggerItem key={valueKey} y={14}>
                                    <article className="viby-login-proof-row">
                                        <div className="viby-login-proof-card__value">{t(valueKey)}</div>
                                        <div className="viby-login-proof-card__label">{t(labelKey)}</div>
                                    </article>
                                </MotionStaggerItem>
                            ))}
                        </MotionStaggerGroup>
                    </section>

                    <section className="viby-login-capabilities">
                        <MotionStaggerGroup className="viby-login-capabilities__grid">
                            {CAPABILITY_ITEMS.map(({ bodyKey, titleKey }) => (
                                <MotionStaggerItem key={titleKey} y={14}>
                                    <article className="viby-login-capability-row">
                                        <h3>{t(titleKey)}</h3>
                                        <p>{t(bodyKey)}</p>
                                    </article>
                                </MotionStaggerItem>
                            ))}
                        </MotionStaggerGroup>
                    </section>

                    <section className="viby-login-flow">
                        <div className="viby-login-flow__intro">
                            <div className="viby-login-dock__label">{t('login.flow.eyebrow')}</div>
                            <h2>{t('login.flow.title')}</h2>
                        </div>
                        <MotionStaggerGroup className="viby-login-flow__grid">
                            {FLOW_ITEMS.map(({ bodyKey, index, titleKey }) => (
                                <MotionStaggerItem key={titleKey} y={14}>
                                    <article className="viby-login-flow-row">
                                        <div className="viby-login-flow-card__index">{index}</div>
                                        <h3>{t(titleKey)}</h3>
                                        <p>{t(bodyKey)}</p>
                                    </article>
                                </MotionStaggerItem>
                            ))}
                        </MotionStaggerGroup>
                    </section>
                </main>

                <footer className="viby-login-footer">{props.footer}</footer>
            </div>
        </div>
    )
}

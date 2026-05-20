// Desktop motion owner. Single source for animation primitives.
// Reuse web's pattern: LazyMotion + small reveal/stagger/presence helpers.
import { AnimatePresence, LazyMotion, MotionConfig, m, type Transition, type Variants } from 'motion/react'
import { type CSSProperties, type ReactNode } from 'react'

export const MOTION_EASE_EMPHASIZED: [number, number, number, number] = [0.22, 1, 0.36, 1]

export const MOTION_DURATIONS = {
    page: 0.36,
    pageExit: 0.25,
    reveal: 0.4,
    stagger: 0.07,
    item: 0.32,
    modal: 0.28,
    toast: 0.24,
    overlay: 0.52,
} as const

const PAGE_TRANSITION: Transition = {
    duration: MOTION_DURATIONS.page,
    ease: MOTION_EASE_EMPHASIZED,
}

const loadFeatures = async () => {
    const mod = await import('./motionFeatures')
    return mod.default
}

export function DesktopMotionProvider(props: { children: ReactNode }) {
    return (
        <MotionConfig reducedMotion="user" transition={PAGE_TRANSITION}>
            <LazyMotion features={loadFeatures}>{props.children}</LazyMotion>
        </MotionConfig>
    )
}

const PAGE_VARIANTS: Variants = {
    initial: { opacity: 0, y: 8, scale: 0.996 },
    animate: { opacity: 1, y: 0, scale: 1, transition: PAGE_TRANSITION },
    exit: {
        opacity: 0,
        y: -6,
        scale: 0.998,
        transition: { duration: MOTION_DURATIONS.pageExit, ease: MOTION_EASE_EMPHASIZED },
    },
}

export function PageTransition(props: { transitionKey: string; children: ReactNode; className?: string }) {
    return (
        <AnimatePresence mode="wait">
            <m.div
                key={props.transitionKey}
                className={props.className}
                variants={PAGE_VARIANTS}
                initial="initial"
                animate="animate"
                exit="exit"
                style={{ willChange: 'opacity, transform', height: '100%' }}
            >
                {props.children}
            </m.div>
        </AnimatePresence>
    )
}

const OVERLAY_VARIANTS: Variants = {
    initial: { opacity: 0, filter: 'blur(1.5px)', y: 10, scale: 0.985 },
    animate: {
        opacity: 1,
        filter: 'blur(0px)',
        y: 0,
        scale: 1,
        transition: { duration: MOTION_DURATIONS.overlay, ease: MOTION_EASE_EMPHASIZED },
    },
    exit: {
        opacity: 0,
        filter: 'blur(1.5px)',
        y: 10,
        scale: 0.985,
        transition: { duration: MOTION_DURATIONS.overlay, ease: MOTION_EASE_EMPHASIZED },
    },
}

export function OverlayTransition(props: { visible: boolean; children: ReactNode; className?: string }) {
    return (
        <AnimatePresence>
            {props.visible ? (
                <m.div
                    className={props.className}
                    variants={OVERLAY_VARIANTS}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    style={{ willChange: 'opacity, filter, transform' }}
                >
                    {props.children}
                </m.div>
            ) : null}
        </AnimatePresence>
    )
}

export function StaggerGroup(props: {
    children: ReactNode
    className?: string
    delay?: number
    stagger?: number
    style?: CSSProperties
}) {
    return (
        <m.div
            className={props.className}
            style={props.style}
            variants={{
                initial: {},
                animate: {
                    transition: {
                        delayChildren: props.delay ?? 0,
                        staggerChildren: props.stagger ?? MOTION_DURATIONS.stagger,
                    },
                },
            }}
            initial="initial"
            animate="animate"
        >
            {props.children}
        </m.div>
    )
}

const ITEM_VARIANTS: Variants = {
    initial: { opacity: 0, y: 14, scale: 0.985 },
    animate: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: MOTION_DURATIONS.item, ease: MOTION_EASE_EMPHASIZED },
    },
}

export function StaggerItem(props: { children: ReactNode; className?: string; role?: string }) {
    return (
        <m.div className={props.className} role={props.role} variants={ITEM_VARIANTS}>
            {props.children}
        </m.div>
    )
}

const PRESENCE_SWAP_VARIANTS: Variants = {
    initial: { opacity: 0, y: 10, scale: 0.985 },
    animate: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: MOTION_DURATIONS.item, ease: MOTION_EASE_EMPHASIZED },
    },
    exit: {
        opacity: 0,
        y: -6,
        scale: 0.99,
        transition: { duration: MOTION_DURATIONS.item * 0.65, ease: MOTION_EASE_EMPHASIZED },
    },
}

export function PresenceSwap(props: { children: ReactNode; className?: string; switchKey: string }) {
    return (
        <AnimatePresence mode="wait" initial={false}>
            <m.div
                key={props.switchKey}
                className={props.className}
                variants={PRESENCE_SWAP_VARIANTS}
                initial="initial"
                animate="animate"
                exit="exit"
                style={{ willChange: 'opacity, transform' }}
            >
                {props.children}
            </m.div>
        </AnimatePresence>
    )
}

const MODAL_VARIANTS: Variants = {
    initial: { opacity: 0, scale: 0.96, y: 12 },
    animate: {
        opacity: 1,
        scale: 1,
        y: 0,
        transition: { duration: MOTION_DURATIONS.modal, ease: MOTION_EASE_EMPHASIZED },
    },
    exit: {
        opacity: 0,
        scale: 0.97,
        y: 6,
        transition: { duration: MOTION_DURATIONS.modal * 0.8, ease: MOTION_EASE_EMPHASIZED },
    },
}

const BACKDROP_VARIANTS: Variants = {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: MOTION_DURATIONS.modal, ease: 'easeOut' } },
    exit: { opacity: 0, transition: { duration: MOTION_DURATIONS.modal * 0.6, ease: 'easeIn' } },
}

export function ModalLayer(props: {
    open: boolean
    children: ReactNode
    backdropClassName?: string
    cardClassName?: string
    onBackdropClick?: () => void
    label?: string
}) {
    return (
        <AnimatePresence>
            {props.open ? (
                <m.div
                    className={props.backdropClassName}
                    variants={BACKDROP_VARIANTS}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    role="presentation"
                    onClick={props.onBackdropClick}
                >
                    <m.section
                        className={props.cardClassName}
                        variants={MODAL_VARIANTS}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        role="dialog"
                        aria-modal="true"
                        aria-label={props.label}
                        onClick={(event) => event.stopPropagation()}
                    >
                        {props.children}
                    </m.section>
                </m.div>
            ) : null}
        </AnimatePresence>
    )
}

const TOAST_VARIANTS: Variants = {
    initial: { opacity: 0, y: -10, scale: 0.985 },
    animate: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: MOTION_DURATIONS.toast, ease: MOTION_EASE_EMPHASIZED },
    },
    exit: {
        opacity: 0,
        y: -6,
        scale: 0.99,
        transition: { duration: MOTION_DURATIONS.toast * 0.8, ease: MOTION_EASE_EMPHASIZED },
    },
}

export function ToastLayer(props: {
    message: string | null
    className?: string
    icon?: ReactNode
    tone?: 'default' | 'success'
}) {
    return (
        <AnimatePresence>
            {props.message ? (
                <m.div
                    className={props.className}
                    data-tone={props.tone ?? 'default'}
                    variants={TOAST_VARIANTS}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    role="status"
                >
                    {props.icon ? <span className="desktop-toast-icon">{props.icon}</span> : null}
                    <span>{props.message}</span>
                </m.div>
            ) : null}
        </AnimatePresence>
    )
}

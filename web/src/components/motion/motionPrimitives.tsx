import { Outlet, useLocation } from '@tanstack/react-router'
import { LazyMotion, MotionConfig, m, type Transition, type Variants } from 'motion/react'
import { type CSSProperties, forwardRef, type ReactNode } from 'react'
import { isSessionsWorkspacePath, normalizeRoutePath } from '@/routes/sessions/sessionRoutePaths'

export const MOTION_EASE_EMPHASIZED: [number, number, number, number] = [0.22, 1, 0.36, 1]
export const MOTION_DURATIONS = {
    route: 0.42,
    routeExit: 0.34,
    reveal: 0.44,
    staggerItem: 0.36,
    stagger: 0.085,
} as const

const PAGE_TRANSITION: Transition = {
    duration: MOTION_DURATIONS.route,
    ease: MOTION_EASE_EMPHASIZED,
}
const loadMotionFeatures = async () => {
    const module = await import('./motionFeatures')
    return module.default
}
const PAGE_VARIANTS: Variants = {
    initial: {
        opacity: 0.9,
        x: 18,
        y: 0,
        scale: 0.992,
    },
    animate: {
        opacity: 1,
        x: 0,
        y: 0,
        scale: 1,
        transition: PAGE_TRANSITION,
    },
    exit: {
        opacity: 0.94,
        x: -14,
        y: 0,
        scale: 0.996,
        transition: {
            duration: MOTION_DURATIONS.routeExit,
            ease: MOTION_EASE_EMPHASIZED,
        },
    },
}
type MotionProviderProps = {
    children: ReactNode
}

type MotionRevealProps = {
    children: ReactNode
    className?: string
    delay?: number
    duration?: number
    style?: CSSProperties
    x?: number
    y?: number
}

type MotionRouteOutletProps = {
    className?: string
    scope: 'app' | 'session-detail'
}

type MotionStaggerGroupProps = {
    children: ReactNode
    className?: string
    delay?: number
    stagger?: number
    style?: CSSProperties
    testId?: string
}

type MotionStaggerItemProps = {
    children: ReactNode
    className?: string
    delay?: number
    duration?: number
    scaleFrom?: number
    x?: number
    y?: number
}

function resolveAppTransitionKey(pathname: string): string {
    if (isSessionsWorkspacePath(pathname)) {
        return 'sessions-shell'
    }

    return normalizeRoutePath(pathname)
}

function resolveSessionDetailTransitionKey(pathname: string): string {
    void pathname
    return 'session-detail-surface'
}

function MotionRouteFrame(props: { children: ReactNode; className?: string; transitionKey: string }) {
    return (
        <div className={`grid h-full min-h-0 w-full ${props.className ?? ''}`}>
            <m.div
                key={props.transitionKey}
                variants={PAGE_VARIANTS}
                initial="initial"
                animate="animate"
                className="col-start-1 row-start-1 h-full min-h-0 w-full"
                style={{ willChange: 'opacity, transform' }}
            >
                {props.children}
            </m.div>
        </div>
    )
}

export function AppMotionProvider(props: MotionProviderProps): React.JSX.Element {
    return (
        <MotionConfig reducedMotion="user" transition={PAGE_TRANSITION}>
            <LazyMotion features={loadMotionFeatures}>{props.children}</LazyMotion>
        </MotionConfig>
    )
}

export function MotionRouteOutlet(props: MotionRouteOutletProps): React.JSX.Element {
    const transitionKey = useLocation({
        select: (location) =>
            props.scope === 'app'
                ? resolveAppTransitionKey(location.pathname)
                : resolveSessionDetailTransitionKey(location.pathname),
    })

    return (
        <MotionRouteFrame transitionKey={transitionKey} className={props.className}>
            <Outlet />
        </MotionRouteFrame>
    )
}

export const MotionReveal = forwardRef<HTMLDivElement, MotionRevealProps>(function MotionReveal(props, ref) {
    const { children, className, delay, duration, style, x, y } = props

    return (
        <m.div
            ref={ref}
            initial={{
                opacity: 0,
                x: x ?? 0,
                y: y ?? 14,
                scale: 0.996,
            }}
            animate={{
                opacity: 1,
                x: 0,
                y: 0,
                scale: 1,
            }}
            transition={{
                duration: duration ?? MOTION_DURATIONS.reveal,
                delay: delay ?? 0,
                ease: MOTION_EASE_EMPHASIZED,
            }}
            className={className}
            style={{
                willChange: 'opacity, transform',
                ...style,
            }}
        >
            {children}
        </m.div>
    )
})

export function MotionStaggerGroup(props: MotionStaggerGroupProps): React.JSX.Element {
    return (
        <m.div
            data-testid={props.testId}
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

export function MotionStaggerItem(props: MotionStaggerItemProps): React.JSX.Element {
    return (
        <m.div
            className={props.className}
            variants={{
                initial: {
                    opacity: 0,
                    x: props.x ?? 0,
                    y: props.y ?? 18,
                    scale: props.scaleFrom ?? 0.982,
                },
                animate: {
                    opacity: 1,
                    x: 0,
                    y: 0,
                    scale: 1,
                    transition: {
                        duration: props.duration ?? MOTION_DURATIONS.staggerItem,
                        delay: props.delay ?? 0,
                        ease: MOTION_EASE_EMPHASIZED,
                    },
                },
            }}
        >
            {props.children}
        </m.div>
    )
}

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const BUTTON_PRESS_STYLE_SCALE = {
    button: 0.86,
    card: 0.96
} as const

type ButtonPressStyle = keyof typeof BUTTON_PRESS_STYLE_SCALE
type ButtonPointerEffect = 'default' | 'none'

const buttonVariants = cva(
    'ds-button inline-flex min-h-[var(--ds-touch-target)] items-center justify-center whitespace-nowrap rounded-[var(--ds-radius-lg)] text-sm font-semibold tracking-[0.01em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:pointer-events-none disabled:opacity-50',
    {
        variants: {
            variant: {
                default: 'border border-[var(--ds-brand)] bg-[var(--ds-brand)] text-[var(--app-button-text)] shadow-[var(--ds-shadow-soft)] [--ds-button-pointer-color:var(--ds-text-inverse)] [--ds-button-sheen-color:255_255_255]',
                secondary: 'border border-[var(--ds-border-default)] bg-[var(--ds-panel-strong)] text-[var(--app-fg)] shadow-[var(--ds-shadow-soft)] hover:border-[var(--ds-border-strong)] hover:bg-[var(--app-subtle-bg)] [--ds-button-pointer-color:var(--ds-brand)] [--ds-button-sheen-color:255_255_255]',
                outline: 'border border-[var(--ds-border-default)] bg-transparent text-[var(--app-fg)] hover:border-[var(--ds-border-strong)] hover:bg-[var(--app-subtle-bg)] [--ds-button-pointer-color:var(--ds-brand)] [--ds-button-sheen-color:255_255_255]',
                destructive: 'border border-[var(--ds-danger)] bg-[var(--ds-danger)] text-[var(--ds-text-inverse)] shadow-[var(--ds-shadow-soft)] [--ds-button-pointer-color:var(--ds-text-inverse)] [--ds-button-sheen-color:255_255_255]',
                ghost: 'border border-transparent bg-transparent text-[var(--app-fg)] shadow-none hover:bg-[var(--app-subtle-bg)] [--ds-button-pointer-color:var(--ds-brand)] [--ds-button-sheen-color:255_255_255]',
                plain: 'bg-transparent text-[var(--app-fg)] shadow-none hover:bg-[var(--app-subtle-bg)] [--ds-button-pointer-color:var(--ds-brand)] [--ds-button-sheen-color:255_255_255]'
            },
            size: {
                default: 'px-5 py-3',
                sm: 'min-h-10 rounded-[var(--ds-radius-md)] px-4 py-2.5 text-sm',
                lg: 'min-h-14 rounded-[var(--ds-radius-xl)] px-6 py-3.5 text-base',
                icon: 'h-[var(--ds-touch-target)] w-[var(--ds-touch-target)] px-0',
                iconSm: 'h-10 w-10 rounded-[var(--ds-radius-md)] px-0',
                iconLg: 'h-12 w-12 rounded-[var(--ds-radius-lg)] px-0'
            }
        },
        defaultVariants: {
            variant: 'default',
            size: 'default'
        }
    }
)

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof buttonVariants> {
    asChild?: boolean
    pressStyle?: ButtonPressStyle
    pointerEffect?: ButtonPointerEffect
}

function setButtonPointerHotspot(
    element: HTMLButtonElement,
    clientX: number,
    clientY: number
): void {
    const rect = element.getBoundingClientRect()
    element.style.setProperty('--ds-button-pointer-x', `${clientX - rect.left}px`)
    element.style.setProperty('--ds-button-pointer-y', `${clientY - rect.top}px`)
}

function clearButtonPointerHotspot(element: HTMLButtonElement): void {
    element.style.removeProperty('--ds-button-pointer-x')
    element.style.removeProperty('--ds-button-pointer-y')
}

function setButtonPressedState(element: HTMLButtonElement, pressed: boolean): void {
    if (pressed) {
        element.dataset.pressed = 'true'
        return
    }

    delete element.dataset.pressed
}

function getButtonAppearance(variant: ButtonProps['variant']): 'solid' | 'surface' {
    if (variant === 'default' || variant === 'destructive') {
        return 'solid'
    }

    return 'surface'
}

function getButtonPressScale(pressStyle: ButtonPressStyle | undefined): number {
    if (pressStyle !== undefined) {
        return BUTTON_PRESS_STYLE_SCALE[pressStyle]
    }

    return BUTTON_PRESS_STYLE_SCALE.button
}

function getButtonPointerEffect(
    pressStyle: ButtonPressStyle | undefined,
    pointerEffect: ButtonPointerEffect | undefined
): ButtonPointerEffect {
    if (pointerEffect !== undefined) {
        return pointerEffect
    }

    if (pressStyle === 'card') {
        return 'none'
    }

    return 'default'
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    function Button(
        {
            className,
            variant,
            size,
            asChild = false,
            pressStyle,
            pointerEffect,
            children,
            onBlur,
            onPointerCancel,
            onPointerDown,
            onPointerLeave,
            onPointerMove,
            onPointerUp,
            style,
            ...props
        },
        ref
    ) {
        const resolvedVariant = variant ?? 'default'
        const resolvedPressStyle = pressStyle ?? 'button'
        const resolvedPressScale = getButtonPressScale(pressStyle)
        const resolvedPointerEffect = getButtonPointerEffect(pressStyle, pointerEffect)
        const Comp = asChild ? Slot : 'button'
        const classNames = cn(buttonVariants({ variant: resolvedVariant, size, className }))
        const resolvedStyle = React.useMemo<React.CSSProperties>(() => ({
            ...style,
            ['--ds-button-press-scale' as '--ds-button-press-scale']: props.disabled ? 1 : resolvedPressScale
        }), [props.disabled, resolvedPressScale, style])

        const handlePointerMove = React.useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
            if (resolvedPointerEffect === 'default' && event.pointerType === 'mouse') {
                setButtonPointerHotspot(event.currentTarget, event.clientX, event.clientY)
            }

            onPointerMove?.(event)
        }, [onPointerMove, resolvedPointerEffect])

        const handlePointerDown = React.useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
            if (resolvedPointerEffect === 'default') {
                setButtonPointerHotspot(event.currentTarget, event.clientX, event.clientY)
            }
            setButtonPressedState(event.currentTarget, true)
            onPointerDown?.(event)
        }, [onPointerDown, resolvedPointerEffect])

        const handlePointerUp = React.useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
            setButtonPressedState(event.currentTarget, false)
            onPointerUp?.(event)
        }, [onPointerUp])

        const handlePointerCancel = React.useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
            setButtonPressedState(event.currentTarget, false)
            onPointerCancel?.(event)
        }, [onPointerCancel])

        const handlePointerLeave = React.useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
            if (resolvedPointerEffect === 'default') {
                clearButtonPointerHotspot(event.currentTarget)
            }
            setButtonPressedState(event.currentTarget, false)
            onPointerLeave?.(event)
        }, [onPointerLeave, resolvedPointerEffect])

        const handleBlur = React.useCallback((event: React.FocusEvent<HTMLButtonElement>) => {
            setButtonPressedState(event.currentTarget, false)
            onBlur?.(event)
        }, [onBlur])

        if (asChild) {
            return (
                <Comp
                    className={classNames}
                    ref={ref}
                    data-button-appearance={getButtonAppearance(resolvedVariant)}
                    data-button-press-style={resolvedPressStyle}
                    data-button-pointer-effect={resolvedPointerEffect}
                    style={resolvedStyle}
                    {...props}
                />
            )
        }

        return (
            <button
                type={props.type ?? 'button'}
                className={classNames}
                ref={ref}
                data-button-appearance={getButtonAppearance(resolvedVariant)}
                data-button-press-style={resolvedPressStyle}
                data-button-pointer-effect={resolvedPointerEffect}
                style={resolvedStyle}
                onPointerMove={handlePointerMove}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                onPointerLeave={handlePointerLeave}
                onBlur={handleBlur}
                {...props}
            >
                <span
                    data-button-content
                    className="relative z-10 inline-flex items-center justify-center"
                    style={{ gap: 'inherit' }}
                >
                    {children}
                </span>
            </button>
        )
    }
)
Button.displayName = 'Button'

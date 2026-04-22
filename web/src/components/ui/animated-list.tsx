import { m } from 'motion/react'
import { Children, type ComponentPropsWithoutRef, type CSSProperties, memo, type ReactNode, useMemo } from 'react'
import { cn } from '@/lib/utils'

type AnimatedListProps = ComponentPropsWithoutRef<'div'> & {
    children: ReactNode
    delay?: number
}

function AnimatedListComponent(props: AnimatedListProps): ReactNode {
    const { children, className, delay = 1_000, ...restProps } = props
    const childrenArray = useMemo(() => {
        return Children.toArray(children).toReversed()
    }, [children])

    return (
        <div className={cn('flex flex-col items-center gap-4', className)} {...restProps}>
            {childrenArray.map((item, itemIndex) => {
                const style = {
                    '--ds-animated-list-delay': `${itemIndex * delay}ms`,
                } as CSSProperties

                return (
                    <m.div
                        key={(item as { key?: string | number | null })?.key ?? itemIndex}
                        className="mx-auto w-full"
                        style={style}
                        initial={{ opacity: 0, y: 12, scale: 0.996 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.998 }}
                        transition={{
                            duration: 0.28,
                            delay: itemIndex * Math.max(delay / 1000, 0.04),
                            ease: [0.22, 1, 0.36, 1],
                        }}
                    >
                        {item}
                    </m.div>
                )
            })}
        </div>
    )
}

export const AnimatedList = memo(AnimatedListComponent)
AnimatedList.displayName = 'AnimatedList'

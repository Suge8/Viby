import { Children, memo, useMemo, type ComponentPropsWithoutRef, type CSSProperties, type ReactNode } from 'react'
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
                    '--ds-animated-list-delay': `${itemIndex * delay}ms`
                } as CSSProperties

                return (
                    <div
                        key={(item as { key?: string | number | null })?.key ?? itemIndex}
                        className="ds-animated-list-item mx-auto w-full"
                        style={style}
                    >
                        {item}
                    </div>
                )
            })}
        </div>
    )
}

export const AnimatedList = memo(AnimatedListComponent)
AnimatedList.displayName = 'AnimatedList'

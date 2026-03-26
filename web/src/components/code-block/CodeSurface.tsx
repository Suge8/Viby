import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { joinClassNames } from '@/lib/joinClassNames'

type CodeSurfaceProps = Omit<ComponentPropsWithoutRef<'div'>, 'children'> & {
    children: ReactNode
    preClassName?: string
}

const CODE_SURFACE_ROOT_CLASS_NAME =
    'min-w-0 w-full max-w-full overflow-x-auto overflow-y-hidden rounded-md bg-[var(--app-code-bg)]'
const CODE_SURFACE_PRE_CLASS_NAME = 'shiki m-0 w-max min-w-full font-mono'

export function CodeSurface(props: CodeSurfaceProps): React.JSX.Element {
    const { children, className, preClassName, ...restProps } = props

    return (
        <div
            {...restProps}
            className={joinClassNames(CODE_SURFACE_ROOT_CLASS_NAME, className)}
        >
            <pre className={joinClassNames(CODE_SURFACE_PRE_CLASS_NAME, preClassName)}>
                {children}
            </pre>
        </div>
    )
}

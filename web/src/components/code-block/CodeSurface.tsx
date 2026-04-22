import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { joinClassNames } from '@/lib/joinClassNames'

type CodeSurfaceProps = Omit<ComponentPropsWithoutRef<'div'>, 'children'> & {
    children: ReactNode
    preClassName?: string
}

const CODE_SURFACE_ROOT_CLASS_NAME =
    'min-w-0 w-full max-w-full overflow-x-auto overflow-y-hidden rounded-md border border-transparent bg-[var(--app-code-bg)] transition-[border-color,background-color,box-shadow] data-[copied=true]:border-[color:color-mix(in_srgb,var(--ds-success)_42%,transparent)] data-[copied=true]:bg-[color:color-mix(in_srgb,var(--ds-success)_6%,var(--app-code-bg))] data-[copied=true]:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--ds-success)_18%,transparent)]'
const CODE_SURFACE_PRE_CLASS_NAME = 'shiki m-0 w-max min-w-full font-mono'

export function CodeSurface(props: CodeSurfaceProps): React.JSX.Element {
    const { children, className, preClassName, ...restProps } = props

    return (
        <div {...restProps} className={joinClassNames(CODE_SURFACE_ROOT_CLASS_NAME, className)}>
            <pre className={joinClassNames(CODE_SURFACE_PRE_CLASS_NAME, preClassName)}>{children}</pre>
        </div>
    )
}

import type { LucideProps } from 'lucide-react'

export type AppIconProps = LucideProps & {
    className?: string
}

export function withDefaultClassName(className?: string): string {
    return className ?? 'h-5 w-5'
}

export function getDefaultStrokeWidth(props: AppIconProps): number {
    if (typeof props.strokeWidth === 'number') {
        return props.strokeWidth
    }

    return 2.25
}

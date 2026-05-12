import { LoaderCircle } from 'lucide-react'
import type { ComponentProps } from 'react'

type LoadingIconProps = ComponentProps<typeof LoaderCircle>

export function LoadingSpinnerIcon(props: LoadingIconProps): React.JSX.Element {
    return <LoaderCircle {...props} strokeWidth={2.1} />
}

import { memo } from 'react'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import {
    FeatureCheckIcon as CheckIcon,
    FeatureCopyIcon as CopyIcon,
} from '@/components/featureIcons'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/use-translation'
import {
    CodeContent,
    type CodeHighlightMode
} from '@/components/code-block/CodeContent'
import { CodeSurface } from '@/components/code-block/CodeSurface'

type CodeBlockProps = {
    code: string
    language?: string
    showCopyButton?: boolean
    highlight?: CodeHighlightMode
}

function CodeBlockComponent(props: CodeBlockProps) {
    const { t } = useTranslation()
    const showCopyButton = props.showCopyButton ?? true
    const { copied, copy } = useCopyToClipboard()

    return (
        <div className="relative min-w-0 max-w-full">
            {showCopyButton ? (
                <Button
                    type="button"
                    variant="plain"
                    size="iconSm"
                    onClick={() => copy(props.code)}
                    className="absolute right-1.5 top-1.5 h-8 w-8 rounded-md p-1 text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)]"
                    title={t('code.copy')}
                >
                    {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                </Button>
            ) : null}

            <CodeSurface preClassName="p-2 pr-8 text-xs">
                <CodeContent
                    code={props.code}
                    language={props.language}
                    highlight={props.highlight}
                />
            </CodeSurface>
        </div>
    )
}

export const CodeBlock = memo(CodeBlockComponent)
CodeBlock.displayName = 'CodeBlock'

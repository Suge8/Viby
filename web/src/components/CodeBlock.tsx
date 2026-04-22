import { memo } from 'react'
import { CopyActionButton } from '@/components/CopyActionButton'
import { CodeContent, type CodeHighlightMode } from '@/components/code-block/CodeContent'
import { CodeSurface } from '@/components/code-block/CodeSurface'
import { useCopyAction } from '@/hooks/useCopyAction'
import { useNoticeCenter } from '@/lib/notice-center'
import { useTranslation } from '@/lib/use-translation'

type CodeBlockProps = {
    code: string
    language?: string
    showCopyButton?: boolean
    highlight?: CodeHighlightMode
}

function CodeBlockComponent(props: CodeBlockProps) {
    const { t } = useTranslation()
    const { addToast } = useNoticeCenter()
    const showCopyButton = props.showCopyButton ?? true
    const { copied, handleCopyClick } = useCopyAction({
        text: props.code,
        onCopied: () => {
            addToast({
                tone: 'success',
                title: t('code.copied.title'),
                description: t('code.copied.description'),
            })
        },
    })

    return (
        <div className="relative min-w-0 max-w-full">
            {showCopyButton ? (
                <div className="absolute right-0.5 top-0.5 z-10">
                    <CopyActionButton
                        label={t('code.copy')}
                        copied={copied}
                        onCopy={(event) => void handleCopyClick(event)}
                    />
                </div>
            ) : null}

            <CodeSurface
                data-copied={copied ? 'true' : undefined}
                preClassName="p-2 [padding-right:calc(var(--ds-touch-target-compact)+0.5rem)] text-xs"
            >
                <CodeContent code={props.code} language={props.language} highlight={props.highlight} />
            </CodeSurface>
        </div>
    )
}

export const CodeBlock = memo(CodeBlockComponent)
CodeBlock.displayName = 'CodeBlock'

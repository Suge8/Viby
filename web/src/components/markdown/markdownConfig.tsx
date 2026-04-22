import {
    type CodeHeaderProps,
    unstable_memoizeMarkdownComponents as memoizeMarkdownComponents,
    useIsMarkdownCodeBlock,
} from '@assistant-ui/react-markdown'
import type { ComponentPropsWithoutRef } from 'react'
import remarkGfm from 'remark-gfm'
import { SyntaxHighlighter } from '@/components/assistant-ui/shiki-highlighter'
import { CopyActionButton } from '@/components/CopyActionButton'
import { useCopyAction } from '@/hooks/useCopyAction'
import { joinClassNames } from '@/lib/joinClassNames'
import { useTranslation } from '@/lib/use-translation'

export const MARKDOWN_PLUGINS = [remarkGfm]

function CodeHeader(props: CodeHeaderProps) {
    const { t } = useTranslation()
    const { copied, handleCopyClick } = useCopyAction({ text: props.code })
    const language = props.language && props.language !== 'unknown' ? props.language : ''

    return (
        <div className="aui-md-codeheader flex items-center justify-between rounded-t-md bg-[var(--app-code-bg)] px-2 py-1">
            <div className="min-w-0 flex-1 pr-2 text-xs font-mono text-[var(--app-hint)]">{language}</div>
            <CopyActionButton
                label={t('code.copy')}
                copied={copied}
                onCopy={(event) => void handleCopyClick(event)}
                className="shrink-0"
            />
        </div>
    )
}

function Pre(props: ComponentPropsWithoutRef<'pre'>) {
    const { className, ...rest } = props

    return (
        <div className="aui-md-pre-wrapper min-w-0 w-full max-w-full overflow-x-auto overflow-y-hidden">
            <pre
                {...rest}
                className={joinClassNames(
                    'aui-md-pre m-0 w-max min-w-full rounded-b-md rounded-t-none bg-[var(--app-code-bg)] p-2 text-sm',
                    className
                )}
            />
        </div>
    )
}

function Code(props: ComponentPropsWithoutRef<'code'>) {
    const isCodeBlock = useIsMarkdownCodeBlock()

    if (isCodeBlock) {
        return <code {...props} className={joinClassNames('aui-md-codeblockcode font-mono', props.className)} />
    }

    return (
        <code
            {...props}
            className={joinClassNames(
                'aui-md-code ds-markdown-inline-code break-words rounded bg-[var(--app-inline-code-bg)] font-mono',
                props.className
            )}
        />
    )
}

function A(props: ComponentPropsWithoutRef<'a'>) {
    const rel = props.target === '_blank' ? (props.rel ?? 'noreferrer') : props.rel

    return (
        <a
            {...props}
            rel={rel}
            className={joinClassNames('aui-md-a text-[var(--app-link)] underline', props.className)}
        />
    )
}

function Paragraph(props: ComponentPropsWithoutRef<'p'>) {
    return <p {...props} className={joinClassNames('aui-md-p leading-relaxed', props.className)} />
}

function Blockquote(props: ComponentPropsWithoutRef<'blockquote'>) {
    return (
        <blockquote
            {...props}
            className={joinClassNames(
                'aui-md-blockquote border-l-4 border-[var(--app-hint)] pl-3 opacity-85',
                props.className
            )}
        />
    )
}

function UnorderedList(props: ComponentPropsWithoutRef<'ul'>) {
    return <ul {...props} className={joinClassNames('aui-md-ul list-disc pl-6', props.className)} />
}

function OrderedList(props: ComponentPropsWithoutRef<'ol'>) {
    return <ol {...props} className={joinClassNames('aui-md-ol list-decimal pl-6', props.className)} />
}

function ListItem(props: ComponentPropsWithoutRef<'li'>) {
    return <li {...props} className={joinClassNames('aui-md-li', props.className)} />
}

function Hr(props: ComponentPropsWithoutRef<'hr'>) {
    return <hr {...props} className={joinClassNames('aui-md-hr border-[var(--app-divider)]', props.className)} />
}

function Table(props: ComponentPropsWithoutRef<'table'>) {
    const { className, ...rest } = props

    return (
        <div className="aui-md-table-wrapper max-w-full overflow-x-auto">
            <table {...rest} className={joinClassNames('aui-md-table w-full border-collapse', className)} />
        </div>
    )
}

function Thead(props: ComponentPropsWithoutRef<'thead'>) {
    return <thead {...props} className={joinClassNames('aui-md-thead', props.className)} />
}

function Tbody(props: ComponentPropsWithoutRef<'tbody'>) {
    return <tbody {...props} className={joinClassNames('aui-md-tbody', props.className)} />
}

function Tr(props: ComponentPropsWithoutRef<'tr'>) {
    return <tr {...props} className={joinClassNames('aui-md-tr', props.className)} />
}

function Th(props: ComponentPropsWithoutRef<'th'>) {
    return (
        <th
            {...props}
            className={joinClassNames(
                'aui-md-th border border-[var(--app-border)] bg-[var(--app-subtle-bg)] px-2 py-1 text-left font-semibold',
                props.className
            )}
        />
    )
}

function Td(props: ComponentPropsWithoutRef<'td'>) {
    return (
        <td
            {...props}
            className={joinClassNames('aui-md-td border border-[var(--app-border)] px-2 py-1', props.className)}
        />
    )
}

function H1(props: ComponentPropsWithoutRef<'h1'>) {
    return <h1 {...props} className={joinClassNames('aui-md-h1 mt-3 text-base font-semibold', props.className)} />
}

function H2(props: ComponentPropsWithoutRef<'h2'>) {
    return <h2 {...props} className={joinClassNames('aui-md-h2 mt-3 text-base font-semibold', props.className)} />
}

function H3(props: ComponentPropsWithoutRef<'h3'>) {
    return <h3 {...props} className={joinClassNames('aui-md-h3 mt-2 text-base font-semibold', props.className)} />
}

function H4(props: ComponentPropsWithoutRef<'h4'>) {
    return <h4 {...props} className={joinClassNames('aui-md-h4 mt-2 text-base font-semibold', props.className)} />
}

function H5(props: ComponentPropsWithoutRef<'h5'>) {
    return <h5 {...props} className={joinClassNames('aui-md-h5 mt-2 text-base font-semibold', props.className)} />
}

function H6(props: ComponentPropsWithoutRef<'h6'>) {
    return <h6 {...props} className={joinClassNames('aui-md-h6 mt-2 text-base font-semibold', props.className)} />
}

function Strong(props: ComponentPropsWithoutRef<'strong'>) {
    return <strong {...props} className={joinClassNames('aui-md-strong font-semibold', props.className)} />
}

function Em(props: ComponentPropsWithoutRef<'em'>) {
    return <em {...props} className={joinClassNames('aui-md-em italic', props.className)} />
}

function Image(props: ComponentPropsWithoutRef<'img'>) {
    return <img {...props} className={joinClassNames('aui-md-img max-w-full rounded', props.className)} />
}

export const MARKDOWN_COMPONENTS = memoizeMarkdownComponents({
    SyntaxHighlighter,
    CodeHeader,
    pre: Pre,
    code: Code,
    h1: H1,
    h2: H2,
    h3: H3,
    h4: H4,
    h5: H5,
    h6: H6,
    a: A,
    p: Paragraph,
    strong: Strong,
    em: Em,
    blockquote: Blockquote,
    ul: UnorderedList,
    ol: OrderedList,
    li: ListItem,
    hr: Hr,
    table: Table,
    thead: Thead,
    tbody: Tbody,
    tr: Tr,
    th: Th,
    td: Td,
    img: Image,
} as const)

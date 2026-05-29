import type { ComponentPropsWithoutRef } from 'react'
import ReactMarkdown, { defaultUrlTransform, type UrlTransform } from 'react-markdown'
import type { CodeHighlightMode } from '@/components/code-block/CodeContent'
import {
    MARKDOWN_COMPONENTS,
    MARKDOWN_PLUGINS,
    MarkdownCodeHighlightProvider,
} from '@/components/markdown/markdownConfig'
import { joinClassNames } from '@/lib/joinClassNames'
import { isMarkdownSessionFileHref } from './markdownFilePathLinks'

const DEFAULT_MARKDOWN_CLASS_NAME = 'aui-md min-w-0 max-w-full break-words'

type MarkdownPrimitiveProps = Omit<
    ComponentPropsWithoutRef<typeof ReactMarkdown>,
    'children' | 'components' | 'remarkPlugins'
> & {
    content: string
    className?: string
    codeHighlight?: CodeHighlightMode
}

const transformMarkdownUrl: UrlTransform = (url) => {
    return isMarkdownSessionFileHref(url) ? url : defaultUrlTransform(url)
}

export function MarkdownPrimitive(props: MarkdownPrimitiveProps): React.JSX.Element {
    const { className, codeHighlight = 'auto', content, ...restProps } = props

    return (
        <MarkdownCodeHighlightProvider highlight={codeHighlight}>
            <div className={joinClassNames(DEFAULT_MARKDOWN_CLASS_NAME, className)}>
                <ReactMarkdown
                    {...restProps}
                    remarkPlugins={MARKDOWN_PLUGINS}
                    components={MARKDOWN_COMPONENTS}
                    urlTransform={transformMarkdownUrl}
                >
                    {content}
                </ReactMarkdown>
            </div>
        </MarkdownCodeHighlightProvider>
    )
}

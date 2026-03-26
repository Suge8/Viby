import { useEffect, useState, type ComponentPropsWithoutRef } from 'react'
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown'
import { joinClassNames } from '@/lib/joinClassNames'

type MarkdownPrimitiveProps = ComponentPropsWithoutRef<typeof MarkdownTextPrimitive>
type MarkdownConfigModule = typeof import('@/components/markdown/markdownConfig')
type MarkdownRenderConfig = {
    components?: MarkdownConfigModule['MARKDOWN_COMPONENTS']
    remarkPlugins?: MarkdownConfigModule['MARKDOWN_PLUGINS']
}

const DEFAULT_MARKDOWN_CLASS_NAME = 'aui-md min-w-0 max-w-full break-words'
const EMPTY_MARKDOWN_RENDER_CONFIG: MarkdownRenderConfig = {}

let markdownConfigModulePromise: Promise<MarkdownConfigModule> | null = null

function loadMarkdownConfigModule(): Promise<MarkdownConfigModule> {
    markdownConfigModulePromise ??= import('@/components/markdown/markdownConfig')
    return markdownConfigModulePromise
}

export function MarkdownPrimitive(props: MarkdownPrimitiveProps): React.JSX.Element {
    const { className, ...restProps } = props
    const [renderConfig, setRenderConfig] = useState<MarkdownRenderConfig>(EMPTY_MARKDOWN_RENDER_CONFIG)

    useEffect(() => {
        let cancelled = false

        void loadMarkdownConfigModule().then((module) => {
            if (cancelled) {
                return
            }

            setRenderConfig({
                components: module.MARKDOWN_COMPONENTS,
                remarkPlugins: module.MARKDOWN_PLUGINS
            })
        })

        return () => {
            cancelled = true
        }
    }, [])

    return (
        <MarkdownTextPrimitive
            {...restProps}
            remarkPlugins={renderConfig.remarkPlugins}
            components={renderConfig.components}
            className={joinClassNames(DEFAULT_MARKDOWN_CLASS_NAME, className)}
        />
    )
}

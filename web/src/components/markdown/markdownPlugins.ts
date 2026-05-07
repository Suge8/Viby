const TRAILING_CJK_AUTOLINK_PUNCT = /(?:[，。、；：！？\u3000\uFF0E]+[）】」』》〉]*)$/

type MarkdownTreeNode = {
    type: string
    url?: string
    value?: string
    children?: MarkdownTreeNode[]
}

export function remarkDisableIndentedCode(this: unknown): void {
    const processor = this as { data(key: string, value?: unknown): unknown }
    const extensions = (processor.data('micromarkExtensions') ?? []) as unknown[]
    extensions.push({ disable: { null: ['codeIndented'] } })
    processor.data('micromarkExtensions', extensions)
}

function stripAutolinkPunctuation(node: MarkdownTreeNode): void {
    const children = node.children
    if (!children) {
        return
    }

    for (let index = 0; index < children.length; index += 1) {
        const child = children[index]
        const textChild = child.children?.[0]
        const isAutolink =
            child.type === 'link' &&
            typeof child.url === 'string' &&
            child.children?.length === 1 &&
            textChild?.type === 'text' &&
            textChild.value === child.url

        if (isAutolink) {
            const url = child.url as string
            const match = url.match(TRAILING_CJK_AUTOLINK_PUNCT)
            if (match) {
                const punctuation = match[0]
                child.url = url.slice(0, -punctuation.length)
                textChild.value = url.slice(0, -punctuation.length)
                children.splice(index + 1, 0, { type: 'text', value: punctuation })
                index += 1
            }
        }

        stripAutolinkPunctuation(child)
    }
}

export function remarkStripCjkAutolinkPunctuation() {
    return (tree: MarkdownTreeNode) => {
        stripAutolinkPunctuation(tree)
    }
}

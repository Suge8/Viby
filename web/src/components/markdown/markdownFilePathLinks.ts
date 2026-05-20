type MarkdownNode = {
    type: string
    value?: string
    url?: string
    children?: MarkdownNode[]
}

const SESSION_FILE_SCHEME = 'viby-session-file:'
const SKIP_PARENT_TYPES = new Set(['code', 'inlineCode', 'link', 'linkReference'])
const FILE_PATH_PATTERN =
    /(^|[\s([{"'`])((?:\/|\.{1,2}\/)[^\s<>"'`]*\/[^\s<>"'`]+\.[A-Za-z0-9]{1,10}(?::\d+)?)(?=$|[\s)\]}"'`,.;:!?，。！？])/g

export function isMarkdownSessionFileHref(href: string): boolean {
    return href.startsWith(SESSION_FILE_SCHEME)
}

function stripLineSuffix(path: string): string {
    return path.replace(/:\d+$/, '')
}

function createFileHref(path: string): string {
    return `${SESSION_FILE_SCHEME}${encodeURIComponent(stripLineSuffix(path))}`
}

export function readMarkdownSessionFilePath(href: string | undefined): string | null {
    if (!href || !isMarkdownSessionFileHref(href)) {
        return null
    }

    try {
        return decodeURIComponent(href.slice(SESSION_FILE_SCHEME.length))
    } catch {
        return null
    }
}

function splitTextNode(value: string): MarkdownNode[] {
    const nodes: MarkdownNode[] = []
    let index = 0

    for (const match of value.matchAll(FILE_PATH_PATTERN)) {
        const matchIndex = match.index ?? 0
        const prefix = match[1] ?? ''
        const path = match[2] ?? ''
        const pathStart = matchIndex + prefix.length

        if (pathStart > index) {
            nodes.push({ type: 'text', value: value.slice(index, pathStart) })
        }
        nodes.push({ type: 'link', url: createFileHref(path), children: [{ type: 'text', value: path }] })
        index = pathStart + path.length
    }

    if (index < value.length) {
        nodes.push({ type: 'text', value: value.slice(index) })
    }

    return nodes.length > 0 ? nodes : [{ type: 'text', value }]
}

function visitChildren(node: MarkdownNode): void {
    if (!node.children || SKIP_PARENT_TYPES.has(node.type)) {
        return
    }

    const nextChildren: MarkdownNode[] = []
    for (const child of node.children) {
        if (child.type === 'text' && typeof child.value === 'string') {
            nextChildren.push(...splitTextNode(child.value))
            continue
        }
        visitChildren(child)
        nextChildren.push(child)
    }
    node.children = nextChildren
}

export function remarkLinkSessionFilePaths() {
    return (tree: MarkdownNode) => {
        visitChildren(tree)
    }
}

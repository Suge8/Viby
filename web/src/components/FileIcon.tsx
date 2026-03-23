import { FileCodeIcon, FileTextIcon } from '@/components/icons'

const EXTENSION_COLORS: Record<string, string> = {
    ts: '#3178c6',
    tsx: '#3178c6',
    js: '#f7df1e',
    jsx: '#f7df1e',
    json: '#f59e0b',
    md: '#64748b',
    mdx: '#64748b',
    css: '#2563eb',
    scss: '#db2777',
    html: '#f97316',
    yml: '#ef4444',
    yaml: '#ef4444',
    sh: '#10b981',
    bash: '#10b981',
    py: '#3776ab',
    go: '#0ea5e9',
    rs: '#f97316',
}

const CODE_EXTENSIONS = new Set([
    'ts',
    'tsx',
    'js',
    'jsx',
    'json',
    'css',
    'scss',
    'html',
    'yml',
    'yaml',
    'sh',
    'bash',
    'py',
    'go',
    'rs',
])

function getFileExtension(fileName: string): string {
    const trimmed = fileName.trim()
    if (trimmed.startsWith('.') && trimmed.indexOf('.', 1) === -1) {
        return trimmed.slice(1).toLowerCase()
    }
    const parts = trimmed.split('.')
    if (parts.length <= 1) return ''
    return parts[parts.length - 1]?.toLowerCase() ?? ''
}

export function FileIcon(props: { fileName: string; size?: number }) {
    const size = props.size ?? 20
    const extension = getFileExtension(props.fileName)
    const color = EXTENSION_COLORS[extension] ?? 'var(--app-hint)'
    const className = 'shrink-0'

    if (CODE_EXTENSIONS.has(extension)) {
        return <FileCodeIcon className={className} style={{ color, width: size, height: size }} strokeWidth={1.9} />
    }

    return <FileTextIcon className={className} style={{ color, width: size, height: size }} strokeWidth={1.9} />
}

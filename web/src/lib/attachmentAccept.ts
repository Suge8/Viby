const SUPPORTED_ATTACHMENT_ACCEPT_PARTS = [
    'image/*',
    '.heic',
    '.heif',
    '.avif',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.bmp',
    '.svg',
    '.pdf',
    '.txt',
    '.md',
    '.json',
    '.yaml',
    '.yml',
    '.toml',
    '.xml',
    '.csv',
    '.log',
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
    'application/yaml',
    'application/toml',
    'application/xml'
] as const

export const SUPPORTED_ATTACHMENT_ACCEPT = SUPPORTED_ATTACHMENT_ACCEPT_PARTS.join(',')

export function isWildcardAttachmentAccept(value: string | null | undefined): boolean {
    if (!value) {
        return true
    }

    const normalized = value.trim()
    return normalized === '*' || normalized === '*/*'
}

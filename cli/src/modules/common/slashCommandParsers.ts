import { parse as parseYaml } from 'yaml'

export function parseFrontmatter(fileContent: string): { description?: string; content: string } {
    const match = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
    if (!match) {
        return { content: fileContent.trim() }
    }

    const yamlContent = match[1]
    const body = match[2].trim()
    try {
        const parsed = parseYaml(yamlContent) as Record<string, unknown> | null
        const description = typeof parsed?.description === 'string' ? parsed.description : undefined
        return { description, content: body }
    } catch {
        return { content: fileContent.trim() }
    }
}

export function parseTomlCommand(fileContent: string): { description?: string; content?: string } {
    const descriptionMatch = fileContent.match(/^\s*description\s*=\s*"([^"\n]*)"/m)
    const promptBlockMatch = fileContent.match(/^\s*prompt\s*=\s*"""\r?\n?([\s\S]*?)\r?\n?"""/m)
    const promptInlineMatch = fileContent.match(/^\s*prompt\s*=\s*"([^"\n]*)"/m)

    return {
        description: descriptionMatch?.[1]?.trim() || undefined,
        content: promptBlockMatch?.[1]?.trim() || promptInlineMatch?.[1]?.trim() || undefined,
    }
}

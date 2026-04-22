export type SlashCommandSource = 'builtin' | 'user' | 'plugin' | 'project'

export interface SlashCommand {
    name: string
    description?: string
    source: SlashCommandSource
    content?: string
    pluginName?: string
}

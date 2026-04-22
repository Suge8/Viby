import { z } from 'zod'

export const MESSAGE_SENT_FROM = ['cli', 'webapp', 'user'] as const

export const MessageSentFromSchema = z.enum(MESSAGE_SENT_FROM)

export type MessageSentFrom = z.infer<typeof MessageSentFromSchema>

export const MessageMetaSchema = z.object({
    sentFrom: MessageSentFromSchema.optional(),
    assistantTurnId: z.string().min(1).optional(),
    fallbackModel: z.string().nullable().optional(),
    customSystemPrompt: z.string().nullable().optional(),
    appendSystemPrompt: z.string().nullable().optional(),
    allowedTools: z.array(z.string()).nullable().optional(),
    disallowedTools: z.array(z.string()).nullable().optional(),
})

export type MessageMeta = z.infer<typeof MessageMetaSchema>

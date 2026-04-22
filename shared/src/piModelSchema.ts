import { z } from 'zod'
import { PI_REASONING_EFFORTS } from './modes'

export const PiReasoningEffortSchema = z.enum(PI_REASONING_EFFORTS)

export const PiModelCapabilitySchema = z.object({
    id: z.string(),
    label: z.string(),
    supportedThinkingLevels: z.array(PiReasoningEffortSchema),
    defaultThinkingLevel: PiReasoningEffortSchema.optional(),
})

export type PiModelCapability = z.infer<typeof PiModelCapabilitySchema>

export const PiModelScopeSchema = z
    .union([
        z.object({
            models: z.array(PiModelCapabilitySchema),
        }),
        z.object({
            availableModels: z.array(z.string()),
        }),
    ])
    .transform((value) => {
        if ('models' in value) {
            return value
        }

        return {
            models: value.availableModels.map((id) => ({
                id,
                label: id,
                supportedThinkingLevels: [...PI_REASONING_EFFORTS],
            })),
        }
    })

export type PiModelScope = z.infer<typeof PiModelScopeSchema>

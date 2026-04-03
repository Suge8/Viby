import type { PiPermissionMode, SessionModel, SessionModelReasoningEffort } from '@/api/types'

export type PiMode = {
    permissionMode: PiPermissionMode
    model: SessionModel
    modelReasoningEffort: SessionModelReasoningEffort
}

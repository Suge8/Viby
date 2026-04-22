import type { ComponentType } from 'react'
import type { ToolCallBlock } from '@/chat/types'
import { AskUserQuestionView } from '@/components/ToolCard/views/AskUserQuestionView'
import { CodexDiffCompactView, CodexDiffFullView } from '@/components/ToolCard/views/CodexDiffView'
import { CodexPatchView } from '@/components/ToolCard/views/CodexPatchView'
import { EditView } from '@/components/ToolCard/views/EditView'
import { MultiEditFullView, MultiEditView } from '@/components/ToolCard/views/MultiEditView'
import { PlanProposalView } from '@/components/ToolCard/views/PlanProposalView'
import { RequestUserInputView } from '@/components/ToolCard/views/RequestUserInputView'
import { TodoWriteView } from '@/components/ToolCard/views/TodoWriteView'
import { UpdatePlanView } from '@/components/ToolCard/views/UpdatePlanView'
import { WriteView } from '@/components/ToolCard/views/WriteView'
import type { SessionMetadataSummary } from '@/types/api'

export type ToolViewProps = {
    block: ToolCallBlock
    metadata: SessionMetadataSummary | null
}

export type ToolViewComponent = ComponentType<ToolViewProps>

export const toolViewRegistry: Record<string, ToolViewComponent> = {
    Edit: EditView,
    MultiEdit: MultiEditView,
    Write: WriteView,
    TodoWrite: TodoWriteView,
    update_plan: UpdatePlanView,
    CodexDiff: CodexDiffCompactView,
    AskUserQuestion: AskUserQuestionView,
    ExitPlanMode: PlanProposalView,
    ask_user_question: AskUserQuestionView,
    exit_plan_mode: PlanProposalView,
    proposed_plan: PlanProposalView,
    request_user_input: RequestUserInputView,
}

export const toolFullViewRegistry: Record<string, ToolViewComponent> = {
    Edit: EditView,
    MultiEdit: MultiEditFullView,
    Write: WriteView,
    CodexDiff: CodexDiffFullView,
    CodexPatch: CodexPatchView,
    AskUserQuestion: AskUserQuestionView,
    ExitPlanMode: PlanProposalView,
    ask_user_question: AskUserQuestionView,
    exit_plan_mode: PlanProposalView,
    proposed_plan: PlanProposalView,
    request_user_input: RequestUserInputView,
}

export function getToolViewComponent(toolName: string): ToolViewComponent | null {
    return toolViewRegistry[toolName] ?? null
}

export function getToolFullViewComponent(toolName: string): ToolViewComponent | null {
    return toolFullViewRegistry[toolName] ?? null
}

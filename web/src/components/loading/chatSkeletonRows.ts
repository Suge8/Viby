import type { SkeletonRow } from '@/components/loading/LoadingSkeleton'

export const CHAT_MESSAGE_SKELETON_ROWS: ReadonlyArray<SkeletonRow> = [
    { align: 'end', widthClassName: 'w-2/3', heightClassName: 'h-10', className: 'rounded-xl' },
    { align: 'start', widthClassName: 'w-3/4', heightClassName: 'h-12', className: 'rounded-xl' },
    { align: 'end', widthClassName: 'w-1/2', heightClassName: 'h-9', className: 'rounded-xl' },
    { align: 'start', widthClassName: 'w-5/6', heightClassName: 'h-14', className: 'rounded-xl' }
] as const

// Web icon system: stay on `lucide-react`.
// Do not introduce unrelated icon packs for product UI.
import {
    AlertCircle,
    Archive,
    ArrowDown,
    ArrowUp,
    Blocks,
    CircleCheckBig,
    CircleX,
    ChevronLeft,
    ChevronRight,
    CirclePlus,
    Compass,
    EllipsisVertical,
    FolderOpen,
    Info,
    LoaderCircle,
    LockKeyhole,
    MessageCircleMore,
    MessageCircleQuestionMark,
    MessagesSquare,
    PanelsTopLeft,
    Plus,
    Settings,
    Square,
    SquareArrowOutUpRight,
    Terminal,
    Users,
} from 'lucide-react'
import { getDefaultStrokeWidth, type AppIconProps, withDefaultClassName } from '@/components/iconUtils'

const BRAND_MARK_MASK_STYLE = {
    WebkitMaskImage: 'url(/brand-logo-tight.png)',
    maskImage: 'url(/brand-logo-tight.png)',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
} as const

export function PlusCircleIcon(props: AppIconProps) {
    return <CirclePlus {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function PlusIcon(props: AppIconProps) {
    return <Plus {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function ArrowDownIcon(props: AppIconProps) {
    return <ArrowDown {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function TerminalIcon(props: AppIconProps) {
    return <Terminal {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function FolderOpenIcon(props: AppIconProps) {
    return <FolderOpen {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function UsersIcon(props: AppIconProps) {
    return <Users {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function MessageSquareIcon(props: AppIconProps) {
    return <MessageCircleMore {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function QuestionIcon(props: AppIconProps) {
    return <MessageCircleQuestionMark {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function PuzzleIcon(props: AppIconProps) {
    return <Blocks {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function ArchiveIcon(props: AppIconProps) {
    return <Archive {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function OpenIcon(props: AppIconProps) {
    return <SquareArrowOutUpRight {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function ChevronIcon(props: AppIconProps & { collapsed?: boolean }) {
    const { collapsed, className, ...restProps } = props

    return (
        <ChevronRight
            {...restProps}
            className={`${withDefaultClassName(className)} transition-transform duration-200 ${collapsed ? '' : 'rotate-90'}`}
            strokeWidth={getDefaultStrokeWidth(props)}
        />
    )
}

export function SettingsIcon(props: AppIconProps) {
    return <Settings {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function InfoIcon(props: AppIconProps) {
    return <Info {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function AlertIcon(props: AppIconProps) {
    return <AlertCircle {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function SuccessIcon(props: AppIconProps) {
    return <CircleCheckBig {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function ErrorIcon(props: AppIconProps) {
    return <CircleX {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function LockIcon(props: AppIconProps) {
    return <LockKeyhole {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function BackIcon(props: AppIconProps) {
    return <ChevronLeft {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function MoreIcon(props: AppIconProps) {
    return <EllipsisVertical {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function ArrowUpIcon(props: AppIconProps) {
    return <ArrowUp {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function SendIcon(props: AppIconProps) {
    return <ArrowUpIcon {...props} />
}

export function StopIcon(props: AppIconProps) {
    return <Square {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function BrandMarkIcon(props: AppIconProps) {
    const { className, color, style } = props

    return (
        <span
            aria-hidden="true"
            className={`${withDefaultClassName(className)} inline-block shrink-0`}
            style={{
                backgroundColor: color ?? 'currentColor',
                ...BRAND_MARK_MASK_STYLE,
                ...style,
            }}
        />
    )
}

export function ConversationIcon(props: AppIconProps) {
    return <MessagesSquare {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function RunnerIcon(props: AppIconProps) {
    return <Compass {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function WorkspaceIcon(props: AppIconProps) {
    return <PanelsTopLeft {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function SpinnerIcon(props: AppIconProps) {
    return <LoaderCircle {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

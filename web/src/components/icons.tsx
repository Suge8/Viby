// Web icon system: stay on `lucide-react`.
// Do not introduce unrelated icon packs for product UI.
import {
    AlertCircle,
    Archive,
    ArrowDown,
    ArrowLeftRight,
    ArrowUp,
    SlidersHorizontal,
    Blocks,
    Check,
    CircleCheckBig,
    CircleX,
    ChevronLeft,
    ChevronRight,
    CirclePlus,
    Clipboard,
    Compass,
    EllipsisVertical,
    Eye,
    FileCode,
    FileText,
    Folder,
    FolderOpen,
    GitCompare,
    GitBranch,
    Globe,
    Info,
    Languages,
    Lightbulb,
    LoaderCircle,
    LockKeyhole,
    MessageCircleMore,
    MessageCircleQuestionMark,
    MessagesSquare,
    Monitor,
    MoonStar,
    Package,
    Palette,
    PanelsTopLeft,
    Paperclip,
    Pencil,
    Plus,
    RefreshCw,
    Rocket,
    Search,
    Settings,
    Share2,
    Sparkles,
    Square,
    SquareArrowOutUpRight,
    Sun,
    Terminal,
    Trash2,
    Type,
    Users,
    Wrench,
    X,
} from 'lucide-react'
import { getDefaultStrokeWidth, type AppIconProps, withDefaultClassName } from '@/components/iconUtils'

export function CloseIcon(props: AppIconProps) {
    return <X {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function ShareIcon(props: AppIconProps) {
    return <Share2 {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function PlusCircleIcon(props: AppIconProps) {
    return <CirclePlus {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function CopyIcon(props: AppIconProps) {
    return <Clipboard {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function CheckIcon(props: AppIconProps) {
    return <Check {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function PlusIcon(props: AppIconProps) {
    return <Plus {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function ArrowDownIcon(props: AppIconProps) {
    return <ArrowDown {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function BulbIcon(props: AppIconProps) {
    return <Lightbulb {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function SearchIcon(props: AppIconProps) {
    return <Search {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function TerminalIcon(props: AppIconProps) {
    return <Terminal {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function GlobeIcon(props: AppIconProps) {
    return <Globe {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function FolderIcon(props: AppIconProps) {
    return <Folder {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function FolderOpenIcon(props: AppIconProps) {
    return <FolderOpen {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function GitBranchIcon(props: AppIconProps) {
    return <GitBranch {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function TranslateIcon(props: AppIconProps) {
    return <Languages {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function UsersIcon(props: AppIconProps) {
    return <Users {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function RocketIcon(props: AppIconProps) {
    return <Rocket {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function EyeIcon(props: AppIconProps) {
    return <Eye {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function WrenchIcon(props: AppIconProps) {
    return <Wrench {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
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

export function FileDiffIcon(props: AppIconProps) {
    return <GitCompare {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function ClipboardIcon(props: AppIconProps) {
    return <Clipboard {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function FileCodeIcon(props: AppIconProps) {
    return <FileCode {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function FileTextIcon(props: AppIconProps) {
    return <FileText {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function ArchiveIcon(props: AppIconProps) {
    return <Archive {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function EditIcon(props: AppIconProps) {
    return <Pencil {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function TrashIcon(props: AppIconProps) {
    return <Trash2 {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
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

export function PaletteIcon(props: AppIconProps) {
    return <Palette {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function TextIcon(props: AppIconProps) {
    return <Type {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function MonitorIcon(props: AppIconProps) {
    return <Monitor {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function MoonIcon(props: AppIconProps) {
    return <MoonStar {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function SunIcon(props: AppIconProps) {
    return <Sun {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
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

export function SwitchToRemoteIcon(props: AppIconProps) {
    return <ArrowLeftRight {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function AttachmentIcon(props: AppIconProps) {
    return <Paperclip {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function SendIcon(props: AppIconProps) {
    return <ArrowUp {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function RefreshIcon(props: AppIconProps) {
    return <RefreshCw {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function StopIcon(props: AppIconProps) {
    return <Square {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function BrandIcon(props: AppIconProps) {
    return <Sparkles {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function ControlsIcon(props: AppIconProps) {
    return <SlidersHorizontal {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function ProjectIcon(props: AppIconProps) {
    return <Package {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
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

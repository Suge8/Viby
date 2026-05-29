import {
    ArrowLeftRight,
    Bot,
    Check,
    Clipboard,
    ClipboardList,
    Cpu,
    Eye,
    FileCode,
    FilePlus2,
    Files,
    FileText,
    Folder,
    GitBranch,
    GitCompare,
    Globe,
    Keyboard,
    Languages,
    Lightbulb,
    ListChecks,
    type LucideIcon,
    Monitor,
    Package,
    Paperclip,
    Pencil,
    RefreshCw,
    Rocket,
    Search,
    SearchCode,
    Share2,
    Shield,
    ShieldAlert,
    SlidersHorizontal,
    Sparkles,
    Trash2,
    Wrench,
    X,
} from 'lucide-react'
import { type AppIconProps, getDefaultStrokeWidth, withDefaultClassName } from '@/components/iconUtils'

function renderFeatureIcon(Icon: LucideIcon, props: AppIconProps): React.JSX.Element {
    return (
        <Icon {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
    )
}

export function FeatureCloseIcon(props: AppIconProps) {
    return renderFeatureIcon(X, props)
}

export function FeatureShareIcon(props: AppIconProps) {
    return renderFeatureIcon(Share2, props)
}

export function FeatureCopyIcon(props: AppIconProps) {
    return renderFeatureIcon(Clipboard, props)
}

export function FeatureCheckIcon(props: AppIconProps) {
    return renderFeatureIcon(Check, props)
}

export function FeatureSearchIcon(props: AppIconProps) {
    return renderFeatureIcon(Search, props)
}

export function FeatureGlobeIcon(props: AppIconProps) {
    return renderFeatureIcon(Globe, props)
}

export function FeatureFolderIcon(props: AppIconProps) {
    return renderFeatureIcon(Folder, props)
}

export function FeatureGitBranchIcon(props: AppIconProps) {
    return renderFeatureIcon(GitBranch, props)
}

export function FeatureTranslateIcon(props: AppIconProps) {
    return renderFeatureIcon(Languages, props)
}

export function FeatureRocketIcon(props: AppIconProps) {
    return renderFeatureIcon(Rocket, props)
}

export function FeatureEyeIcon(props: AppIconProps) {
    return renderFeatureIcon(Eye, props)
}

export function FeatureWrenchIcon(props: AppIconProps) {
    return renderFeatureIcon(Wrench, props)
}

export function FeatureFileDiffIcon(props: AppIconProps) {
    return renderFeatureIcon(GitCompare, props)
}

export function FeatureFileCodeIcon(props: AppIconProps) {
    return renderFeatureIcon(FileCode, props)
}

export function FeatureFileTextIcon(props: AppIconProps) {
    return renderFeatureIcon(FileText, props)
}

export function FeatureEditIcon(props: AppIconProps) {
    return renderFeatureIcon(Pencil, props)
}

export function FeatureTrashIcon(props: AppIconProps) {
    return renderFeatureIcon(Trash2, props)
}

export function FeatureRefreshIcon(props: AppIconProps) {
    return renderFeatureIcon(RefreshCw, props)
}

export function FeatureAgentIcon(props: AppIconProps) {
    return renderFeatureIcon(Bot, props)
}

export function FeatureAttachmentIcon(props: AppIconProps) {
    return renderFeatureIcon(Paperclip, props)
}

export function FeatureControlsIcon(props: AppIconProps) {
    return renderFeatureIcon(SlidersHorizontal, props)
}

export function FeatureModelIcon(props: AppIconProps) {
    return renderFeatureIcon(Cpu, props)
}

export function FeatureProjectIcon(props: AppIconProps) {
    return renderFeatureIcon(Package, props)
}

export function FeatureMonitorIcon(props: AppIconProps) {
    return renderFeatureIcon(Monitor, props)
}

export function FeatureBulbIcon(props: AppIconProps) {
    return renderFeatureIcon(Lightbulb, props)
}

export function FeatureKeyboardIcon(props: AppIconProps) {
    return renderFeatureIcon(Keyboard, props)
}

export function FeatureShieldIcon(props: AppIconProps) {
    return renderFeatureIcon(Shield, props)
}

export function FeatureSwitchToRemoteIcon(props: AppIconProps) {
    return renderFeatureIcon(ArrowLeftRight, props)
}

export function FeatureSparklesIcon(props: AppIconProps) {
    return renderFeatureIcon(Sparkles, props)
}

export function FeatureListChecksIcon(props: AppIconProps) {
    return renderFeatureIcon(ListChecks, props)
}

export function FeatureClipboardListIcon(props: AppIconProps) {
    return renderFeatureIcon(ClipboardList, props)
}

export function FeatureSearchCodeIcon(props: AppIconProps) {
    return renderFeatureIcon(SearchCode, props)
}

export function FeatureFilePlusIcon(props: AppIconProps) {
    return renderFeatureIcon(FilePlus2, props)
}

export function FeatureFilesIcon(props: AppIconProps) {
    return renderFeatureIcon(Files, props)
}

export function FeatureShieldAlertIcon(props: AppIconProps) {
    return renderFeatureIcon(ShieldAlert, props)
}

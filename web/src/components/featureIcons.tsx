import {
    ArrowLeftRight,
    Bot,
    Check,
    Clipboard,
    Cpu,
    Eye,
    FileCode,
    FileText,
    Folder,
    GitBranch,
    GitCompare,
    Globe,
    Languages,
    Lightbulb,
    Monitor,
    Package,
    Paperclip,
    Pencil,
    RefreshCw,
    Rocket,
    Search,
    Share2,
    Shield,
    SlidersHorizontal,
    Trash2,
    Wrench,
    X,
} from 'lucide-react'
import { type AppIconProps, getDefaultStrokeWidth, withDefaultClassName } from '@/components/iconUtils'

export function FeatureCloseIcon(props: AppIconProps) {
    return <X {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
}

export function FeatureShareIcon(props: AppIconProps) {
    return (
        <Share2
            {...props}
            className={withDefaultClassName(props.className)}
            strokeWidth={getDefaultStrokeWidth(props)}
        />
    )
}

export function FeatureCopyIcon(props: AppIconProps) {
    return (
        <Clipboard
            {...props}
            className={withDefaultClassName(props.className)}
            strokeWidth={getDefaultStrokeWidth(props)}
        />
    )
}

export function FeatureCheckIcon(props: AppIconProps) {
    return (
        <Check
            {...props}
            className={withDefaultClassName(props.className)}
            strokeWidth={getDefaultStrokeWidth(props)}
        />
    )
}

export function FeatureSearchIcon(props: AppIconProps) {
    return (
        <Search
            {...props}
            className={withDefaultClassName(props.className)}
            strokeWidth={getDefaultStrokeWidth(props)}
        />
    )
}

export function FeatureGlobeIcon(props: AppIconProps) {
    return (
        <Globe
            {...props}
            className={withDefaultClassName(props.className)}
            strokeWidth={getDefaultStrokeWidth(props)}
        />
    )
}

export function FeatureFolderIcon(props: AppIconProps) {
    return (
        <Folder
            {...props}
            className={withDefaultClassName(props.className)}
            strokeWidth={getDefaultStrokeWidth(props)}
        />
    )
}

export function FeatureGitBranchIcon(props: AppIconProps) {
    return (
        <GitBranch
            {...props}
            className={withDefaultClassName(props.className)}
            strokeWidth={getDefaultStrokeWidth(props)}
        />
    )
}

export function FeatureTranslateIcon(props: AppIconProps) {
    return (
        <Languages
            {...props}
            className={withDefaultClassName(props.className)}
            strokeWidth={getDefaultStrokeWidth(props)}
        />
    )
}

export function FeatureRocketIcon(props: AppIconProps) {
    return (
        <Rocket
            {...props}
            className={withDefaultClassName(props.className)}
            strokeWidth={getDefaultStrokeWidth(props)}
        />
    )
}

export function FeatureEyeIcon(props: AppIconProps) {
    return (
        <Eye {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
    )
}

export function FeatureWrenchIcon(props: AppIconProps) {
    return (
        <Wrench
            {...props}
            className={withDefaultClassName(props.className)}
            strokeWidth={getDefaultStrokeWidth(props)}
        />
    )
}

export function FeatureFileDiffIcon(props: AppIconProps) {
    return (
        <GitCompare
            {...props}
            className={withDefaultClassName(props.className)}
            strokeWidth={getDefaultStrokeWidth(props)}
        />
    )
}

export function FeatureFileCodeIcon(props: AppIconProps) {
    return (
        <FileCode
            {...props}
            className={withDefaultClassName(props.className)}
            strokeWidth={getDefaultStrokeWidth(props)}
        />
    )
}

export function FeatureFileTextIcon(props: AppIconProps) {
    return (
        <FileText
            {...props}
            className={withDefaultClassName(props.className)}
            strokeWidth={getDefaultStrokeWidth(props)}
        />
    )
}

export function FeatureEditIcon(props: AppIconProps) {
    return (
        <Pencil
            {...props}
            className={withDefaultClassName(props.className)}
            strokeWidth={getDefaultStrokeWidth(props)}
        />
    )
}

export function FeatureTrashIcon(props: AppIconProps) {
    return (
        <Trash2
            {...props}
            className={withDefaultClassName(props.className)}
            strokeWidth={getDefaultStrokeWidth(props)}
        />
    )
}

export function FeatureRefreshIcon(props: AppIconProps) {
    return (
        <RefreshCw
            {...props}
            className={withDefaultClassName(props.className)}
            strokeWidth={getDefaultStrokeWidth(props)}
        />
    )
}

export function FeatureAgentIcon(props: AppIconProps) {
    return (
        <Bot {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
    )
}

export function FeatureAttachmentIcon(props: AppIconProps) {
    return (
        <Paperclip
            {...props}
            className={withDefaultClassName(props.className)}
            strokeWidth={getDefaultStrokeWidth(props)}
        />
    )
}

export function FeatureControlsIcon(props: AppIconProps) {
    return (
        <SlidersHorizontal
            {...props}
            className={withDefaultClassName(props.className)}
            strokeWidth={getDefaultStrokeWidth(props)}
        />
    )
}

export function FeatureModelIcon(props: AppIconProps) {
    return (
        <Cpu {...props} className={withDefaultClassName(props.className)} strokeWidth={getDefaultStrokeWidth(props)} />
    )
}

export function FeatureProjectIcon(props: AppIconProps) {
    return (
        <Package
            {...props}
            className={withDefaultClassName(props.className)}
            strokeWidth={getDefaultStrokeWidth(props)}
        />
    )
}

export function FeatureMonitorIcon(props: AppIconProps) {
    return (
        <Monitor
            {...props}
            className={withDefaultClassName(props.className)}
            strokeWidth={getDefaultStrokeWidth(props)}
        />
    )
}

export function FeatureBulbIcon(props: AppIconProps) {
    return (
        <Lightbulb
            {...props}
            className={withDefaultClassName(props.className)}
            strokeWidth={getDefaultStrokeWidth(props)}
        />
    )
}

export function FeatureShieldIcon(props: AppIconProps) {
    return (
        <Shield
            {...props}
            className={withDefaultClassName(props.className)}
            strokeWidth={getDefaultStrokeWidth(props)}
        />
    )
}

export function FeatureSwitchToRemoteIcon(props: AppIconProps) {
    return (
        <ArrowLeftRight
            {...props}
            className={withDefaultClassName(props.className)}
            strokeWidth={getDefaultStrokeWidth(props)}
        />
    )
}

type LottieAnimatedProperty = {
    a?: unknown
    k?: unknown
}

type LottieTransform = {
    o?: { k?: unknown }
    p?: { k?: unknown }
    r?: { k?: unknown }
    s?: { k?: unknown }
    sk?: { k?: unknown }
}

type LottieLayer = {
    hd?: unknown
    ind?: unknown
    ks?: LottieTransform
    nm?: unknown
    parent?: unknown
    refId?: unknown
    ty?: unknown
}

type LottieAsset = {
    id?: unknown
    layers?: LottieLayer[]
    nm?: unknown
    p?: unknown
}

type LottieData = {
    assets?: LottieAsset[]
    bg?: unknown
    fr?: unknown
    h?: unknown
    layers?: LottieLayer[]
    op?: unknown
    w?: unknown
}

const FACE_LAYER_NAMES = new Set(['Rectangle 2', 'Rectangle 3', 'Rectangle 4', 'Rectangle 5', 'Rectangle 6'])
const ORIGINAL_BLUE = [0.1804, 0.3686, 1] as const
const OLD_GREEN = [0.1843, 0.5608, 0.3569] as const
const LOGO_ASSET_ID = 'image_viby_logo_tight'
const PAPER_ORBIT_PHASE = 30
const PAPER_ORBIT_RADIUS = -152
const PAPER_SIZE = 81

function hasAnimatedProperty(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false
    if ('a' in value && (value as LottieAnimatedProperty).a === 1) return true
    return Object.values(value).some((child) =>
        Array.isArray(child) ? child.some(hasAnimatedProperty) : hasAnimatedProperty(child)
    )
}

function nestedSceneOne(animation: LottieData): LottieAsset | null {
    return animation.assets?.find((asset) => asset.nm === 'Nested Scene 1') ?? null
}

function layerByName(layers: LottieLayer[] | undefined, name: string): LottieLayer | null {
    return layers?.find((layer) => layer.nm === name) ?? null
}

function assetById(animation: LottieData, id: string): LottieAsset | null {
    return animation.assets?.find((asset) => asset.id === id) ?? null
}

function hasColor(value: unknown, target: readonly number[]): boolean {
    if (Array.isArray(value) && target.every((component, index) => value[index] === component)) return true
    if (!value || typeof value !== 'object') return false
    return Object.values(value).some((child) => hasColor(child, target))
}

function isVisibleLayer(layer: LottieLayer): boolean {
    return layer.hd !== true && layer.ks?.o?.k !== 0
}

function vectorEquals(value: unknown, target: readonly number[]): boolean {
    return Array.isArray(value) && target.every((component, index) => value[index] === component)
}

function keyframeEndpoints(value: unknown, start: number, end: number): boolean {
    if (!Array.isArray(value) || value.length < 2) return false
    const first = value[0] as { s?: unknown }
    const last = value[value.length - 1] as { s?: unknown }
    return vectorEquals(first.s, [start]) && vectorEquals(last.s, [end])
}

function maxScale(value: unknown): number | null {
    if (Array.isArray(value) && typeof value[0] === 'number') return Math.max(value[0], value[1] ?? value[0])
    if (!Array.isArray(value)) return null
    return Math.max(...value.map((frame) => maxScale((frame as { s?: unknown }).s) ?? 0))
}

export function hasPlayableTimeline(animation: LottieData): boolean {
    return typeof animation.fr === 'number' && typeof animation.op === 'number' && animation.fr > 0 && animation.op > 1
}

export function hasSizedViewport(animation: LottieData): boolean {
    return typeof animation.w === 'number' && typeof animation.h === 'number' && animation.w > 0 && animation.h > 0
}

export function hasAnimatedContent(animation: LottieData): boolean {
    return hasAnimatedProperty(animation)
}

export function hasVisibleBackground(animation: LottieData): boolean {
    if (typeof animation.bg === 'string' && animation.bg.length > 0) return true
    return animation.layers?.some((layer) => layer.nm === 'BG' && isVisibleLayer(layer)) ?? false
}

export function hasVisibleOriginalFace(animation: LottieData): boolean {
    return (
        nestedSceneOne(animation)?.layers?.some(
            (layer) => FACE_LAYER_NAMES.has(String(layer.nm)) && isVisibleLayer(layer)
        ) ?? false
    )
}

export function hasOriginalBluePalette(animation: LottieData): boolean {
    return hasColor(animation, ORIGINAL_BLUE)
}

export function hasOldGreenPalette(animation: LottieData): boolean {
    return hasColor(animation, OLD_GREEN)
}

export function hasLogoOnTopPaper(animation: LottieData): boolean {
    const orbit = layerByName(animation.layers, 'Viby Logo Orbit')
    const logo = layerByName(animation.layers, 'Viby Logo')
    const scale = maxScale(logo?.ks?.s?.k)
    return (
        orbit?.ty === 3 &&
        logo?.ty === 2 &&
        logo.parent === orbit.ind &&
        logo.refId === LOGO_ASSET_ID &&
        assetById(animation, LOGO_ASSET_ID)?.p === 'brand-logo-tight.png' &&
        vectorEquals(orbit.ks?.p?.k, [256, 256]) &&
        keyframeEndpoints(orbit.ks?.r?.k, PAPER_ORBIT_PHASE, PAPER_ORBIT_PHASE + 360) &&
        vectorEquals(logo.ks?.p?.k, [0, PAPER_ORBIT_RADIUS]) &&
        keyframeEndpoints(logo.ks?.r?.k, -PAPER_ORBIT_PHASE, -PAPER_ORBIT_PHASE - 360) &&
        scale !== null &&
        (512 * scale) / 100 < PAPER_SIZE * 0.75
    )
}

export function hasAnimatedLogoDetail(animation: LottieData): boolean {
    const orbit = layerByName(animation.layers, 'Viby Logo Orbit')
    return ['Viby Logo Code Chevron', 'Viby Logo Code Slash'].every((name) => {
        const layer = layerByName(animation.layers, name)
        return layer?.parent === orbit?.ind && hasAnimatedProperty(layer?.ks?.s) && hasAnimatedProperty(layer?.ks?.sk)
    })
}

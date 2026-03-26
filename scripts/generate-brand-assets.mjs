import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(scriptDir, '..')
const brandSourceDir = join(workspaceRoot, 'branding')
const logoPath = join(brandSourceDir, 'logo.png')
const webPublicDir = join(workspaceRoot, 'web', 'public')
const desktopIconsDir = join(workspaceRoot, 'desktop', 'src-tauri', 'icons')
const tauriCliPath = join(
    workspaceRoot,
    'desktop',
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'tauri.cmd' : 'tauri'
)
const ffmpegPath = process.env.FFMPEG_BIN || '/opt/homebrew/bin/ffmpeg'

const PALETTE = {
    ink: '#222326',
    inkSoft: '#31333a',
    navy: '#1d2740',
    navySoft: '#2f3957',
    coral: '#ff9f72',
    coralSoft: '#ffd2bf',
    warm: '#fff8f1',
    warmDeep: '#fff0e4',
    line: '#e7d3c4',
}
const LEGACY_WEB_BRAND_ASSET_NAMES = ['brand-browser-icon.png', 'brand-logo.png', 'brand-mark.svg']
const WEB_APP_ICON_OUTPUTS = [
    ['apple-touch-icon-180x180.png', 180],
    ['pwa-64x64.png', 64],
    ['pwa-192x192.png', 192],
    ['pwa-512x512.png', 512],
    ['maskable-icon-512x512.png', 512],
]
const DESKTOP_BASE_ICON_OUTPUTS = [
    ['32x32.png', 32],
    ['64x64.png', 64],
    ['128x128.png', 128],
    ['128x128@2x.png', 256],
    ['icon.png', 512],
]
const WINDOWS_TILE_ICON_NAMES = [
    'icon.ico',
    'Square30x30Logo.png',
    'Square44x44Logo.png',
    'Square71x71Logo.png',
    'Square89x89Logo.png',
    'Square107x107Logo.png',
    'Square142x142Logo.png',
    'Square150x150Logo.png',
    'Square284x284Logo.png',
    'Square310x310Logo.png',
    'StoreLogo.png',
]
const WEB_SYMBOL_IMAGE_FRAME = {
    x: 8,
    y: 4,
    size: 84,
}
const WEB_APP_ICON_FRAME = {
    x: 8,
    y: 8,
    size: 84,
}

function ensureDir(dirPath) {
    mkdirSync(dirPath, { recursive: true })
}

function run(command, args, cwd = workspaceRoot, maxBuffer = 1024 * 1024 * 64) {
    execFileSync(command, args, { cwd, stdio: 'inherit', maxBuffer })
}

function capture(command, args, cwd = workspaceRoot, encoding = 'utf8', maxBuffer = 1024 * 1024 * 64) {
    return execFileSync(command, args, { cwd, encoding, maxBuffer })
}

function captureBuffer(command, args, cwd = workspaceRoot, maxBuffer = 1024 * 1024 * 64) {
    return execFileSync(command, args, { cwd, maxBuffer })
}

function writeText(filePath, contents) {
    ensureDir(dirname(filePath))
    const normalized = contents
        .split('\n')
        .map((line) => line.trimEnd())
        .join('\n')
    writeFileSync(filePath, `${normalized}\n`, 'utf8')
}

function copyIfExists(fromPath, toPath) {
    if (!existsSync(fromPath)) {
        return
    }
    ensureDir(dirname(toPath))
    cpSync(fromPath, toPath)
}

function readImageSize(filePath) {
    const output = capture('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', filePath])
    const width = Number(output.match(/pixelWidth: (\d+)/)?.[1] || 0)
    const height = Number(output.match(/pixelHeight: (\d+)/)?.[1] || 0)

    if (!width || !height) {
        throw new Error(`Failed to read image size for ${filePath}`)
    }

    return { width, height }
}

function resizeImage(inputPath, outputPath, size) {
    ensureDir(dirname(outputPath))
    run('/usr/bin/sips', ['-z', String(size), String(size), inputPath, '--out', outputPath])
}

function rasterizeSvg(svgPath, outputPath, size) {
    const thumbnailDir = mkdtempSync(join(tmpdir(), 'viby-svg-thumb-'))

    run('/usr/bin/qlmanage', ['-t', '-s', String(size), '-o', thumbnailDir, svgPath], workspaceRoot)

    const expectedFileName = `${basename(svgPath)}.png`
    const thumbnailPath = existsSync(join(thumbnailDir, expectedFileName))
        ? join(thumbnailDir, expectedFileName)
        : join(thumbnailDir, readdirSync(thumbnailDir).find((fileName) => fileName.endsWith('.png')) || '')

    if (!thumbnailPath || !existsSync(thumbnailPath)) {
        throw new Error(`Quick Look did not generate a thumbnail for ${svgPath}`)
    }

    resizeImage(thumbnailPath, outputPath, size)
    rmSync(thumbnailDir, { recursive: true, force: true })
}

function createTransparentSymbol(inputPath, outputPath) {
    ensureDir(dirname(outputPath))
    run(ffmpegPath, [
        '-y',
        '-i',
        inputPath,
        '-vf',
        'format=rgba,colorkey=0xFFFFFF:0.075:0.0',
        '-frames:v',
        '1',
        '-update',
        '1',
        outputPath,
    ])
}

function findOpaqueBounds(filePath) {
    const { width, height } = readImageSize(filePath)
    const pixels = captureBuffer(ffmpegPath, [
        '-v',
        'error',
        '-i',
        filePath,
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgba',
        'pipe:1',
    ])

    let minX = width
    let minY = height
    let maxX = -1
    let maxY = -1

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const offset = (y * width + x) * 4
            const alpha = pixels[offset + 3]

            if (alpha <= 8) {
                continue
            }

            if (x < minX) minX = x
            if (y < minY) minY = y
            if (x > maxX) maxX = x
            if (y > maxY) maxY = y
        }
    }

    if (maxX < minX || maxY < minY) {
        throw new Error(`No opaque pixels found in ${filePath}`)
    }

    return {
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        imageWidth: width,
        imageHeight: height,
    }
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max)
}

function cropTransparentSquare(inputPath, outputPath, options = {}) {
    const {
        paddingRatio = 0.16,
        verticalBias = 0.02,
        resizeTo = 1024,
    } = options

    const bounds = findOpaqueBounds(inputPath)
    const side = Math.min(
        bounds.imageWidth,
        bounds.imageHeight,
        Math.ceil(Math.max(bounds.width, bounds.height) * (1 + paddingRatio * 2))
    )
    const centerX = (bounds.minX + bounds.maxX) / 2
    const centerY = (bounds.minY + bounds.maxY) / 2 + bounds.height * verticalBias
    const cropOffsetX = clamp(Math.round(centerX - side / 2), 0, bounds.imageWidth - side)
    const cropOffsetY = clamp(Math.round(centerY - side / 2), 0, bounds.imageHeight - side)
    const tempCropPath = join(tmpdir(), `viby-brand-crop-${Date.now()}-${Math.random().toString(16).slice(2)}.png`)

    run('/usr/bin/sips', [
        '--cropToHeightWidth',
        String(side),
        String(side),
        inputPath,
        '--cropOffset',
        String(cropOffsetY),
        String(cropOffsetX),
        '--out',
        tempCropPath,
    ])
    resizeImage(tempCropPath, outputPath, resizeTo)
    rmSync(tempCropPath, { force: true })
}

function buildImageOnlySvg(symbolHref, frame = WEB_SYMBOL_IMAGE_FRAME) {
    return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
            <image href="${symbolHref}" x="${frame.x}" y="${frame.y}" width="${frame.size}" height="${frame.size}" preserveAspectRatio="xMidYMid meet" />
        </svg>
    `.trim()
}

function buildWebAppIconSvg(symbolHref) {
    return buildImageOnlySvg(symbolHref, WEB_APP_ICON_FRAME)
}

function buildDesktopTileIconSvg(symbolHref) {
    return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
            <defs>
                <linearGradient id="web-tile-bg" x1="14" y1="10" x2="86" y2="92" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#fff8f3" />
                    <stop offset="1" stop-color="#ffece0" />
                </linearGradient>
                <radialGradient id="web-tile-halo" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(76 18) rotate(140) scale(34 34)">
                    <stop stop-color="${PALETTE.coral}" stop-opacity="0.26" />
                    <stop offset="1" stop-color="${PALETTE.coral}" stop-opacity="0" />
                </radialGradient>
                <filter id="web-tile-shadow" x="10" y="10" width="80" height="82" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
                    <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#111827" flood-opacity="0.18" />
                </filter>
            </defs>
            <rect x="10" y="10" width="80" height="80" rx="24" fill="url(#web-tile-bg)" />
            <rect x="10" y="10" width="80" height="80" rx="24" fill="url(#web-tile-halo)" />
            <g filter="url(#web-tile-shadow)">
                <rect x="10.75" y="10.75" width="78.5" height="78.5" rx="23.2" stroke="${PALETTE.line}" stroke-width="1.5" />
            </g>
            <image href="${symbolHref}" x="19" y="16" width="62" height="62" preserveAspectRatio="xMidYMid meet" />
        </svg>
    `.trim()
}

function buildMacAppIconSvg(symbolHref) {
    return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
            <defs>
                <linearGradient id="mac-bg" x1="11" y1="6" x2="86" y2="95" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#253255" />
                    <stop offset="0.58" stop-color="${PALETTE.navySoft}" />
                    <stop offset="1" stop-color="#5a6784" />
                </linearGradient>
                <radialGradient id="mac-coral" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(77 16) rotate(140) scale(34 34)">
                    <stop stop-color="${PALETTE.coral}" stop-opacity="0.42" />
                    <stop offset="1" stop-color="${PALETTE.coral}" stop-opacity="0" />
                </radialGradient>
                <filter id="mac-card-shadow" x="8" y="10" width="84" height="84" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
                    <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#0f172a" flood-opacity="0.2" />
                </filter>
            </defs>
            <rect x="4" y="4" width="92" height="92" rx="27" fill="url(#mac-bg)" />
            <rect x="4" y="4" width="92" height="92" rx="27" fill="url(#mac-coral)" />
            <path d="M9 17C18.5 8.6 31 5 50 5c18.7 0 31 3.6 40.4 12v14.5c-8-5.3-21.2-8.6-40.4-8.6-19.8 0-33 3.3-41 8.6V17Z" fill="#ffffff" opacity="0.11" />
            <g filter="url(#mac-card-shadow)">
                <rect x="14" y="14" width="72" height="72" rx="23" fill="${PALETTE.warm}" />
                <rect x="14.8" y="14.8" width="70.4" height="70.4" rx="22.2" stroke="${PALETTE.line}" stroke-width="1.6" />
            </g>
            <ellipse cx="50" cy="24" rx="30" ry="11" fill="#ffffff" opacity="0.16" />
            <ellipse cx="50" cy="84" rx="26" ry="8.5" fill="#111827" opacity="0.12" />
            <image href="${symbolHref}" x="21" y="18.5" width="58" height="58" preserveAspectRatio="xMidYMid meet" />
        </svg>
    `.trim()
}

function buildWindowsAppIconSvg(symbolHref) {
    return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
            <defs>
                <linearGradient id="windows-bg" x1="12" y1="10" x2="88" y2="92" gradientUnits="userSpaceOnUse">
                    <stop stop-color="${PALETTE.navy}" />
                    <stop offset="0.65" stop-color="#394663" />
                    <stop offset="1" stop-color="#56627d" />
                </linearGradient>
                <linearGradient id="windows-sheen" x1="14" y1="76" x2="84" y2="18" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#ffffff" stop-opacity="0" />
                    <stop offset="1" stop-color="#ffffff" stop-opacity="0.18" />
                </linearGradient>
                <filter id="windows-card-shadow" x="8" y="10" width="84" height="84" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
                    <feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.18" />
                </filter>
            </defs>
            <rect x="6" y="6" width="88" height="88" rx="21" fill="url(#windows-bg)" />
            <path d="M6 72 72 6h22v12L18 94H6V72Z" fill="url(#windows-sheen)" />
            <g filter="url(#windows-card-shadow)">
                <rect x="16" y="16" width="68" height="68" rx="18" fill="${PALETTE.warmDeep}" />
                <rect x="16.8" y="16.8" width="66.4" height="66.4" rx="17.2" stroke="${PALETTE.line}" stroke-width="1.6" />
            </g>
            <image href="${symbolHref}" x="22.5" y="20" width="55" height="55" preserveAspectRatio="xMidYMid meet" />
        </svg>
    `.trim()
}

function buildMacIcns(sourceSvgPath, outputPath) {
    const iconsetParentDir = mkdtempSync(join(tmpdir(), 'viby-brand-iconset-'))
    const iconsetDir = join(iconsetParentDir, 'viby.iconset')
    const sizes = [
        ['icon_16x16.png', 16],
        ['icon_16x16@2x.png', 32],
        ['icon_32x32.png', 32],
        ['icon_32x32@2x.png', 64],
        ['icon_128x128.png', 128],
        ['icon_128x128@2x.png', 256],
        ['icon_256x256.png', 256],
        ['icon_256x256@2x.png', 512],
        ['icon_512x512.png', 512],
        ['icon_512x512@2x.png', 1024],
    ]

    ensureDir(iconsetDir)
    for (const [fileName, size] of sizes) {
        rasterizeSvg(sourceSvgPath, join(iconsetDir, fileName), size)
    }

    run('/usr/bin/iconutil', ['-c', 'icns', iconsetDir, '-o', outputPath])
    rmSync(iconsetParentDir, { recursive: true, force: true })
}

function runTauriIcon(sourcePath, outputDir) {
    ensureDir(dirname(outputDir))
    rmSync(outputDir, { recursive: true, force: true })
    run(tauriCliPath, ['icon', sourcePath, '--output', outputDir], join(workspaceRoot, 'desktop'))
}

function main() {
    if (!existsSync(logoPath)) {
        throw new Error(`Missing brand source image at ${logoPath}`)
    }
    if (!existsSync(ffmpegPath)) {
        throw new Error(`Missing ffmpeg binary at ${ffmpegPath}`)
    }

    const tempDir = mkdtempSync(join(tmpdir(), 'viby-brand-assets-'))
    const transparentSymbolPath = join(tempDir, 'brand-symbol-transparent.png')
    const tightSymbolPath = join(tempDir, 'brand-symbol-tight.png')
    const macSvgPath = join(tempDir, 'mac-app-icon.svg')
    const windowsSvgPath = join(tempDir, 'windows-app-icon.svg')
    const webAppSvgPath = join(tempDir, 'web-app-icon.svg')
    const desktopTileSvgPath = join(tempDir, 'desktop-app-icon.svg')
    const desktopTilePngPath = join(tempDir, 'desktop-app-icon.png')
    const windowsPngPath = join(tempDir, 'brand-windows-icon.png')
    const faviconDir = join(tempDir, 'favicon-output')
    const windowsOutputDir = join(tempDir, 'windows-output')

    createTransparentSymbol(logoPath, transparentSymbolPath)
    cropTransparentSquare(transparentSymbolPath, tightSymbolPath, {
        paddingRatio: 0.15,
        verticalBias: 0.02,
        resizeTo: 1024,
    })

    const symbolFileUrl = pathToFileURL(tightSymbolPath).href
    const publicSymbolHref = '/brand-logo-tight.png'

    writeText(webAppSvgPath, buildWebAppIconSvg(symbolFileUrl))
    writeText(desktopTileSvgPath, buildDesktopTileIconSvg(symbolFileUrl))
    writeText(macSvgPath, buildMacAppIconSvg(symbolFileUrl))
    writeText(windowsSvgPath, buildWindowsAppIconSvg(symbolFileUrl))

    for (const fileName of LEGACY_WEB_BRAND_ASSET_NAMES) {
        rmSync(join(webPublicDir, fileName), { force: true })
    }

    resizeImage(tightSymbolPath, join(webPublicDir, 'brand-logo-tight.png'), 512)
    writeText(join(webPublicDir, 'icon.svg'), buildImageOnlySvg(publicSymbolHref))
    writeText(join(webPublicDir, 'mask-icon.svg'), buildImageOnlySvg(publicSymbolHref))

    for (const [fileName, size] of WEB_APP_ICON_OUTPUTS) {
        rasterizeSvg(webAppSvgPath, join(webPublicDir, fileName), size)
    }

    runTauriIcon(tightSymbolPath, faviconDir)
    copyIfExists(join(faviconDir, 'icon.ico'), join(webPublicDir, 'favicon.ico'))

    ensureDir(desktopIconsDir)
    for (const [fileName, size] of DESKTOP_BASE_ICON_OUTPUTS) {
        rasterizeSvg(desktopTileSvgPath, join(desktopIconsDir, fileName), size)
    }

    buildMacIcns(macSvgPath, join(desktopIconsDir, 'icon.icns'))
    rasterizeSvg(windowsSvgPath, windowsPngPath, 1024)
    runTauriIcon(windowsPngPath, windowsOutputDir)

    for (const windowsFileName of WINDOWS_TILE_ICON_NAMES) {
        copyIfExists(join(windowsOutputDir, windowsFileName), join(desktopIconsDir, windowsFileName))
    }

    resizeImage(tightSymbolPath, join(desktopIconsDir, 'tray-macos-template.png'), 32)
    resizeImage(tightSymbolPath, join(desktopIconsDir, 'tray-macos-template@2x.png'), 64)
    rasterizeSvg(desktopTileSvgPath, desktopTilePngPath, 512)
    resizeImage(desktopTilePngPath, join(desktopIconsDir, 'tray-windows.png'), 32)
    resizeImage(desktopTilePngPath, join(desktopIconsDir, 'tray-windows@2x.png'), 64)

    rmSync(tempDir, { recursive: true, force: true })
}

main()

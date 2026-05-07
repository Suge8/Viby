import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import hubBootAnimation from '@/assets/hub-boot.lottie.json'
import {
    hasAnimatedContent,
    hasAnimatedLogoDetail,
    hasLogoOnTopPaper,
    hasOldGreenPalette,
    hasOriginalBluePalette,
    hasPlayableTimeline,
    hasSizedViewport,
    hasVisibleBackground,
    hasVisibleOriginalFace,
} from './lottieShapePolicy'

const DOT_LOTTIE_PATH = 'src/assets/hub-boot.lottie'
const MONKEY_LOTTIE_PATH = 'src/assets/monkey-see.lottie'
const LOCAL_FILE_HEADER = 0x04034b50
const DEFLATED = 8

function readZipEntry(path: string, entryName: string): Buffer {
    const archive = readFileSync(path)
    let offset = 0

    while (archive.readUInt32LE(offset) === LOCAL_FILE_HEADER) {
        const compression = archive.readUInt16LE(offset + 8)
        const compressedSize = archive.readUInt32LE(offset + 18)
        const nameLength = archive.readUInt16LE(offset + 26)
        const extraLength = archive.readUInt16LE(offset + 28)
        const nameStart = offset + 30
        const dataStart = nameStart + nameLength + extraLength
        const name = archive.subarray(nameStart, nameStart + nameLength).toString()
        const data = archive.subarray(dataStart, dataStart + compressedSize)

        if (name === entryName) return compression === DEFLATED ? inflateRawSync(data) : Buffer.from(data)
        offset = dataStart + compressedSize
    }

    throw new Error(`Missing zip entry: ${entryName}`)
}

describe('lottieShapePolicy', () => {
    it('keeps the hub boot lottie playable', () => {
        expect(hasPlayableTimeline(hubBootAnimation)).toBe(true)
        expect(hasSizedViewport(hubBootAnimation)).toBe(true)
        expect(hasAnimatedContent(hubBootAnimation)).toBe(true)
    })

    it('keeps the boot animation transparent and neutral', () => {
        expect(hasVisibleBackground(hubBootAnimation)).toBe(false)
        expect(hasVisibleOriginalFace(hubBootAnimation)).toBe(false)
        expect(hasOriginalBluePalette(hubBootAnimation)).toBe(false)
        expect(hasOldGreenPalette(hubBootAnimation)).toBe(false)
    })

    it('locks the brand mark to the visible lead paper', () => {
        expect(hasLogoOnTopPaper(hubBootAnimation)).toBe(true)
        expect(hasAnimatedLogoDetail(hubBootAnimation)).toBe(true)
    })

    it('keeps the generated dotLottie package in sync', () => {
        const packedJson = JSON.parse(readZipEntry(DOT_LOTTIE_PATH, 'a/Main Scene.json').toString())
        expect(packedJson).toEqual(hubBootAnimation)
        expect(readZipEntry(DOT_LOTTIE_PATH, 'i/brand-logo-tight.png').byteLength).toBeGreaterThan(0)
    })

    it('keeps the waiting monkey lottie background-free', () => {
        const animation = JSON.parse(readZipEntry(MONKEY_LOTTIE_PATH, 'animations/12345.json').toString())
        const layerNames = animation.layers.map((layer: { nm?: string }) => layer.nm)
        expect(layerNames).not.toContain('bg')
        expect(layerNames).not.toContain('Shape Layer 1')
    })
})

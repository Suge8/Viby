import QRCode from 'qrcode'

const QR_ERROR_CORRECTION_LEVEL = 'M'
const QR_QUIET_ZONE_MODULES = 1
const QR_MODULE_PATH = 'h1v1H'

export interface PairingQrCodeModel {
    path: string
    viewBox: string
}

export function buildPairingQrCodeModel(value: string): PairingQrCodeModel {
    const qrCode = QRCode.create(value, { errorCorrectionLevel: QR_ERROR_CORRECTION_LEVEL })
    const size = qrCode.modules.size
    const segments: string[] = []

    for (let row = 0; row < size; row += 1) {
        for (let column = 0; column < size; column += 1) {
            if (qrCode.modules.data[row * size + column]) {
                segments.push(`M${column} ${row}${QR_MODULE_PATH}${column}z`)
            }
        }
    }

    const origin = -QR_QUIET_ZONE_MODULES
    const viewSize = size + QR_QUIET_ZONE_MODULES * 2

    return {
        path: segments.join(''),
        viewBox: `${origin} ${origin} ${viewSize} ${viewSize}`,
    }
}

export const landingPageDeviceSupportScript = `
    const deviceKeyKey = 'viby:pairing:' + pairingId + ':device-key';

    function encodeBase64Url(bytes) {
      let binary = '';
      for (const byte of bytes) {
        binary += String.fromCharCode(byte);
      }
      return btoa(binary).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/g, '');
    }

    function decodeBase64Url(value) {
      const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
      const binary = atob(padded);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return bytes;
    }

    function createDeviceProofPayload(challengeNonce, signedAt) {
      return new TextEncoder().encode(pairingId + ':' + challengeNonce + ':' + signedAt);
    }

    async function createPairingDeviceIdentity() {
      if (!self.crypto || !self.crypto.subtle) {
        throw new Error('当前浏览器不支持 WebCrypto，无法建立受信设备绑定。');
      }

      const keyPair = await self.crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify']
      );
      const [publicKey, privateKeyJwk] = await Promise.all([
        self.crypto.subtle.exportKey('spki', keyPair.publicKey),
        self.crypto.subtle.exportKey('jwk', keyPair.privateKey)
      ]);
      const identity = {
        publicKey: encodeBase64Url(new Uint8Array(publicKey)),
        privateKeyJwk
      };
      window.localStorage.setItem(deviceKeyKey, JSON.stringify(identity));
      return identity;
    }

    async function loadPairingDeviceIdentity() {
      const cached = window.localStorage.getItem(deviceKeyKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed && typeof parsed.publicKey === 'string' && parsed.privateKeyJwk && typeof parsed.privateKeyJwk === 'object') {
            return parsed;
          }
        } catch {}
      }

      return await createPairingDeviceIdentity();
    }

    async function createReconnectDeviceProof(identity, challengeNonce) {
      if (!self.crypto || !self.crypto.subtle) {
        throw new Error('当前浏览器不支持 WebCrypto，无法完成设备证明。');
      }

      const signedAt = Date.now();
      const importedPrivateKey = await self.crypto.subtle.importKey(
        'jwk',
        identity.privateKeyJwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign']
      );
      const signature = await self.crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        importedPrivateKey,
        createDeviceProofPayload(challengeNonce, signedAt)
      );

      return {
        publicKey: identity.publicKey,
        challengeNonce,
        signedAt,
        signature: encodeBase64Url(new Uint8Array(signature))
      };
    }

    function clearPairingDeviceIdentity() {
      window.localStorage.removeItem(deviceKeyKey);
    }
`

import { readFileSync }             from 'node:fs';
import { describe, expect, test }   from 'vitest';

describe('index.html', () => {

    test('keeps the crypto buffer and npm buffer version ids separate', () => {
        const html       = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
        const ids        = Array.from(html.matchAll(/\bid=["']([^"']+)["']/g), match => match[1]);

        expect(ids.filter(id => id === 'buffer')).toHaveLength(1);
        expect(ids.filter(id => id === 'bufferJS')).toHaveLength(1);
    });

    test('keeps the QR camera preview inline on iOS', () => {
        const html       = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
        const configXml  = readFileSync(new URL('../config.xml',    import.meta.url), 'utf8');
        const scannerTag = html.match(/<video\b[^>]*\bid=["']qrCodeScannerVideo["'][^>]*>/)?.[0];

        expect(scannerTag).toContain('playsinline');
        expect(scannerTag).toContain('webkit-playsinline');
        expect(configXml).toMatch(/<platform\s+name=["']ios["'][\s\S]*?<preference\s+name=["']AllowInlineMediaPlayback["']\s+value=["']true["']\s*\/>[\s\S]*?<\/platform>/);
    });

});

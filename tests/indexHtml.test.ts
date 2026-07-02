import { readFileSync }             from 'node:fs';
import { describe, expect, test }   from 'vitest';

describe('index.html', () => {

    test('keeps the crypto buffer and npm buffer version ids separate', () => {
        const html       = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
        const ids        = Array.from(html.matchAll(/\bid=["']([^"']+)["']/g), match => match[1]);

        expect(ids.filter(id => id === 'buffer')).toHaveLength(1);
        expect(ids.filter(id => id === 'bufferJS')).toHaveLength(1);
    });

});

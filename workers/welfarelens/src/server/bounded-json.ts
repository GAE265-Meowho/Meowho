/** Bounded JSON reader shared by the two existing Azure adapters. */
export async function boundedText(input: Request | Response, limit: number, signal: AbortSignal) {
    const reader = input.body?.getReader();
    if (!reader)
        throw Error('Missing body');
    const chunks: Uint8Array[] = [];
    let size = 0;
    let abort: () => void = () => { };
    const deadline = new Promise<never>((_, reject) => { abort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError')); signal.addEventListener('abort', abort, { once: true }); if (signal.aborted)
        abort(); });
    try {
        while (true) {
            const { done, value } = await Promise.race([reader.read(), deadline]);
            if (done)
                break;
            size += value.byteLength;
            if (size > limit)
                throw new RangeError('Body too large');
            chunks.push(value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.length;
        }
        return new TextDecoder().decode(bytes);
    }
    finally {
        signal.removeEventListener('abort', abort);
        void reader.cancel().catch(() => { });
        reader.releaseLock();
    }
}
export async function boundedJson(input: Request | Response, limit: number, signal: AbortSignal) {
    return JSON.parse(await boundedText(input, limit, signal));
}

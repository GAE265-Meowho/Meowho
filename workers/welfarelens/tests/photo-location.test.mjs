import assert from 'node:assert/strict';
import { test } from 'node:test';
import { photoPoint, PhotoPointSchema } from '../src/domain/photo-location.ts';

test('photo coordinates remain relative at different sizes and scroll offsets', () => {
    assert.deepEqual(photoPoint(85, 70, {left: 10, top: -30, width: 300, height: 200}), [.25, .5]);
    assert.deepEqual(photoPoint(150, 400, {left: 0, top: 0, width: 600, height: 800}), [.25, .5]);
});
test('out-of-bounds points and unloaded images cannot produce a location', () => {
    assert.equal(photoPoint(5, 10, {left: 10, top: 0, width: 100, height: 100}), null);
    assert.equal(photoPoint(0, 0, {left: 0, top: 0, width: 0, height: 0}), null);
    assert.equal(PhotoPointSchema.safeParse([1, Infinity]).success, false);
});

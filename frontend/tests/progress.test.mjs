// Chạy: node --test frontend/tests/progress.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const window = {};
vm.runInNewContext(readFileSync(new URL('../public/tang/progress.js', import.meta.url), 'utf8'), { window });
const P = window.PROGRESS;

const canvas = (evidence, assumption = 0) =>
  Object.fromEntries(Array.from({ length: 9 }, (_, i) => [
    'c' + i,
    { status: i < evidence ? 'evidence' : i < evidence + assumption ? 'assumption' : 'empty' },
  ]));
const KEYS = Array.from({ length: 9 }, (_, i) => 'c' + i);

test('Thinking = số ô có bằng chứng / 9, ô giả định không tính', () => {
  assert.equal(P.thinking(canvas(4, 3), KEYS), 4 / 9);
  assert.equal(P.thinking(canvas(9), KEYS), 1);
  assert.equal(P.thinking(null, KEYS), 0);
});

test('Planning = số task xong / tổng số task, chờ review chưa tính', () => {
  assert.equal(P.planning([{ done: true }, { done: false, review: true }, { done: false }, { done: true }]), 0.5);
  assert.equal(P.planning([]), 0);
});

test('Pitching, Quality, Maintaining = số card đã có nội dung / số card của trang', () => {
  assert.equal(P.cards([false, false, false]), 0);
  assert.equal(P.cards([true, false, false]), 1 / 3); // Pitching: Khảo sát, Pitching HTML, Bài quảng cáo
  assert.equal(P.cards([true, true, false, true]), 3 / 4); // Quality
  assert.equal(P.cards([true, true]), 1); // Maintaining
});

test('lit: dở dang thì không tắt hẳn và không sáng hết', () => {
  assert.equal(P.lit(0, 12), 0);
  assert.equal(P.lit(1, 12), 12);
  assert.equal(P.lit(1 / 40, 12), 1);
  assert.equal(P.lit(23 / 24, 12), 11);
  assert.equal(P.lit(4 / 9, 9), 4);
});

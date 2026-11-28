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

test('Bảng Task chỉ hiện task của sprint đang chọn, mặc định là sprint hiện tại', () => {
  const s1 = { id: 1, starts_on: '2026-11-23', ends_on: '2026-11-29', tasks: [{ id: 'a', progress: 'todo' }] };
  const s2 = { id: 2, starts_on: '2026-11-30', ends_on: '2026-12-06', tasks: [{ id: 'b', progress: 'todo' }, { id: 'c', progress: 'done' }] };
  const now = Date.parse('2026-11-28T10:00:00Z');
  assert.deepEqual(P.boardTasks([s1, s2], null, now).map(t => t.id), ['a']);
  assert.deepEqual(P.boardTasks([s1, s2], 2, now).map(t => t.id), ['b', 'c']);
  assert.deepEqual(P.boardTasks([s1, s2], 'all', now).map(t => t.id), ['a', 'b', 'c']);
  assert.equal(P.pickedSprint([s1, s2], 99, now), s1); // sprint đã bị xóa thì về sprint hiện tại
  assert.equal(P.pickedSprint([s1, s2], 'all', now), null);
  assert.deepEqual(P.boardTasks([], null, now), []);
});

test('Sprint hiện tại: ngoài mọi khung ngày thì lấy sprint còn task dở', () => {
  const s1 = { id: 1, starts_on: '2026-11-01', ends_on: '2026-11-07', tasks: [{ progress: 'done' }] };
  const s2 = { id: 2, starts_on: '2026-11-08', ends_on: '2026-11-14', tasks: [{ progress: 'todo' }] };
  assert.equal(P.currentSprint([s1, s2], Date.parse('2026-12-20T00:00:00Z')), s2);
});

test('Ghim sprint đang xem khi sửa task, kể cả khi task cuối cùng chuyển sang Xong', () => {
  const task = { id: 'a', progress: 'todo' };
  const s1 = { id: 1, starts_on: '2026-11-01', ends_on: '2026-11-07', tasks: [task] };
  const s2 = { id: 2, starts_on: '2026-11-08', ends_on: '2026-11-14', tasks: [{ id: 'b', progress: 'todo' }] };
  const sprints = [s1, s2];
  const now = Date.parse('2026-12-20T00:00:00Z');
  const pinned = P.pinSprintPick(sprints, null, now);
  assert.equal(pinned, '1');
  task.progress = 'done';
  assert.equal(P.pickedSprint(sprints, null, now), s2);
  assert.deepEqual(P.boardTasks(sprints, pinned, now).map(t => t.id), ['a']);
  assert.equal(P.pinSprintPick(sprints, '1', now), '1');
  assert.equal(P.pinSprintPick(sprints, 'all', now), 'all');
  assert.equal(P.pinSprintPick([s1], 'all', now), null);
  assert.equal(P.pinSprintPick([], '1', now), null);
});

test('Sprint đổi ngày lúc 00:00 giờ Việt Nam và tính hết ngày kết thúc', () => {
  const s1 = { id: 1, starts_on: '2026-11-23', ends_on: '2026-11-29', tasks: [{ id: 'a', progress: 'todo' }] };
  const s2 = { id: 2, starts_on: '2026-11-30', ends_on: '2026-12-06', tasks: [{ id: 'b', progress: 'todo' }] };
  const sprints = [s1, s2];
  assert.equal(P.currentSprint(sprints, Date.parse('2026-11-29T16:59:59.999Z')), s1);
  assert.equal(P.currentSprint(sprints, Date.parse('2026-11-29T17:00:00Z')), s2);
  assert.equal(P.currentSprint(sprints, Date.parse('2026-11-29T23:59:59Z')), s2);
  assert.equal(P.pickedSprint(sprints, '1', Date.parse('2026-11-29T17:00:00Z')), s1);
  assert.equal(P.currentSprint(sprints, Date.parse('2026-12-06T16:59:59.999Z')), s2);
  assert.equal(P.currentSprint(sprints, Date.parse('2026-12-06T17:00:00Z')), s1);
});

test('lit: dở dang thì không tắt hẳn và không sáng hết', () => {
  assert.equal(P.lit(0, 12), 0);
  assert.equal(P.lit(1, 12), 12);
  assert.equal(P.lit(1 / 40, 12), 1);
  assert.equal(P.lit(23 / 24, 12), 11);
  assert.equal(P.lit(4 / 9, 9), 4);
});

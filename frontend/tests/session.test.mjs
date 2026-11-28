// Chạy: node --test frontend/tests/session.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const window = {};
vm.runInNewContext(readFileSync(new URL('../public/tang/session.js', import.meta.url), 'utf8'), { window });
const { wipe, stale } = window.SESSION;

const storage = init => {
  const data = new Map(Object.entries(init));
  return {
    get length() { return data.size; },
    key: i => [...data.keys()][i] ?? null,
    removeItem: k => data.delete(k),
    keys: () => [...data.keys()],
  };
};

test('wipe xoá mọi dữ liệu Workstation, kể cả bản cũ và bản dự phòng, giữ khoá khác', () => {
  const s = storage({ 'tang-v4': '1', 'tang-v4-backup-pitching': '1', 'tang-demo-v2': '1', 'tang-demo-v3': '1', 'tang.invite': '1', 'chat-session': '1' });
  wipe(s);
  assert.deepEqual(s.keys(), ['chat-session']);
});

const me = { profile: { github_id: '1' } };
const other = { profile: { github_id: '2' } };
const out = { profile: null };

test('stale: dữ liệu của một tài khoản GitHub chỉ giữ khi đúng tài khoản đó đang đăng nhập', () => {
  assert.equal(stale(me, { owner: '1' }), false);
  assert.equal(stale(out, { owner: '1' }), true); // đã đăng xuất, kể cả khi chưa vào đội
  assert.equal(stale(other, { owner: '1' }), true); // đổi sang tài khoản khác
  assert.equal(stale(null, { owner: '1' }), false); // chưa kết nối được server
});

test('stale: bản nháp trước khi đăng nhập được giữ, bản cũ chưa ghi chủ nhưng đã đồng bộ đội thì xoá', () => {
  assert.equal(stale(out, { shared: {} }), false);
  assert.equal(stale(me, { shared: {} }), false);
  assert.equal(stale(out, { shared: { project: true } }), true);
  assert.equal(stale(me, { shared: { project: true } }), false);
});

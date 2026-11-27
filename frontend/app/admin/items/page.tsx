'use client';

// Trang CRUD mẫu — copy khi làm tính năng mới (bảng + form + xoá có xác nhận).
import { useState, type FormEvent } from 'react';
import { api, type Item } from '@/lib/api';
import { fmtTime, useLoad } from '@/lib/hooks';
import { Shell } from '@/components/kit/Shell';
import { Empty, ErrorBox, Field, Icon, Loading, StatusChip, useConfirm } from '@/components/kit/ui';

export default function ItemsPage() {
  const items = useLoad(api.items);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<Item['status']>('todo');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<number | null>(null);
  const [confirmNode, ask] = useConfirm();

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError('Nhập tiêu đề');
    setSaving(true);
    setError(null);
    try {
      const item = await api.createItem({ title: title.trim(), status });
      items.setData((l) => [...(l || []), item]);
      setFresh(item.id);
      setTitle('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không lưu được');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: Item) => {
    if (!(await ask({ title: 'Xoá bản ghi?', body: <>Xoá “{item.title}”. Không hoàn tác được.</>, confirmLabel: 'Xoá', danger: true }))) return;
    await api.deleteItem(item.id);
    items.setData((l) => (l || []).filter((x) => x.id !== item.id));
  };

  return (
    <Shell title="Dữ liệu mẫu">
      {confirmNode}
      <form onSubmit={add} className="d-card flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1"><Field label="Tiêu đề" error={error || undefined}><input className={`d-inp ${error ? 'bad' : ''}`} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Việc cần làm" /></Field></div>
        <Field label="Trạng thái">
          <select className="d-sel !w-[160px]" value={status} onChange={(e) => setStatus(e.target.value as Item['status'])}>
            <option value="todo">Cần làm</option><option value="doing">Đang làm</option><option value="done">Xong</option>
          </select>
        </Field>
        <button type="submit" className="d-btn d-b1" disabled={saving} aria-busy={saving}><Icon name="plus" />Thêm</button>
      </form>
      <ErrorBox message={items.error} />
      <div className="d-card">
        {items.loading ? <Loading /> : !items.data?.length ? <Empty>Chưa có bản ghi.</Empty> : (
          <div className="d-tbl-wrap">
            <table className="d-tbl">
              <thead><tr><th>#</th><th>Tiêu đề</th><th>Trạng thái</th><th>Tạo lúc</th><th /></tr></thead>
              <tbody>
                {items.data.map((it) => (
                  <tr key={it.id} className={fresh === it.id ? 'd-row-new' : ''}>
                    <td className="d-faint tabular-nums">{it.id}</td>
                    <td>{it.title}{it.description && <div className="d-faint text-[14px]">{it.description}</div>}</td>
                    <td><StatusChip status={it.status} /></td>
                    <td className="d-faint whitespace-nowrap text-[15px]">{fmtTime(it.created_at)}</td>
                    <td className="text-right"><button type="button" className="d-ib" aria-label="Xoá" title="Xoá" onClick={() => remove(it)}><Icon name="trash" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  );
}

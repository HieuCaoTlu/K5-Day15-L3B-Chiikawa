'use client';

// Kiểm soát token / chi phí Gemini. Số liệu từ bảng llm_calls (backend/app/agent/llm.py ghi mỗi lượt gọi).
// Ngân sách ngày: DAILY_BUDGET_USD trong .env — hết ngân sách thì agent tự dùng luật dự phòng, không gọi Gemini nữa.
import { useEffect, useState } from 'react';
import { api, type Usage, type UsageRow } from '@/lib/api';
import { fmtTime } from '@/lib/hooks';
import { Shell } from '@/components/kit/Shell';
import { Bars, Empty, ErrorBox, Icon, Kpi, Loading, Seg, fmtInt, fmtTokens, fmtUsd, fmtVnd } from '@/components/kit/ui';

const RANGES = [
  { value: 1, label: 'Hôm nay' },
  { value: 7, label: '7 ngày' },
  { value: 30, label: '30 ngày' },
];

export default function UsagePage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => api.usage(days).then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [days]);

  const t = data?.totals;
  const b = data?.budget;
  const used = b && b.daily_usd > 0 ? b.spent_today_usd / b.daily_usd : 0;

  return (
    <Shell title="Chi phí & token" actions={
      <>
        <Seg label="Khoảng thời gian" options={RANGES} value={days} onChange={setDays} />
        <button type="button" className="d-btn d-b2" onClick={load}><Icon name="refresh" />Tải lại</button>
      </>
    }>
      <ErrorBox message={error} />
      {!data || !t || !b ? <Loading /> : (
        <>
          <div className="d-grid4">
            <Kpi label="Chi phí" value={fmtUsd(t.cost_usd)} note={`≈ ${fmtVnd(t.cost_usd, b.usd_to_vnd)}`} />
            <Kpi label="Token vào / ra" value={`${fmtTokens(t.input_tokens)} / ${fmtTokens(t.output_tokens)}`} />
            <Kpi label="Lượt gọi Gemini" value={fmtInt(t.calls)} note={t.errors ? `${t.errors} lượt lỗi` : 'Không có lỗi'} />
            <Kpi label="Độ trễ trung bình" value={`${(t.avg_latency_ms / 1000).toFixed(1).replace('.', ',')} s`} />
          </div>

          <div className="d-card flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div className="text-lg">Ngân sách hôm nay</div>
              <div className="d-muted text-[15px]">
                {b.daily_usd > 0 ? <>{fmtUsd(b.spent_today_usd)} / {fmtUsd(b.daily_usd)} · {Math.round(used * 100)}%</> : 'Không giới hạn (DAILY_BUDGET_USD=0)'}
              </div>
            </div>
            {b.daily_usd > 0 && (
              <div className="d-bar"><i style={{ width: `${Math.min(100, used * 100)}%`, background: used >= 0.8 ? 'var(--color-warn)' : undefined }} /></div>
            )}
            {used >= 1 ? (
              <div className="d-alert err">Đã dùng hết ngân sách ngày. Agent đang trả lời bằng luật dự phòng tới 0h UTC. Tăng DAILY_BUDGET_USD trong .env nếu cần.</div>
            ) : used >= 0.8 ? (
              <div className="d-alert err">Đã dùng {Math.round(used * 100)}% ngân sách ngày — cân nhắc bật DEMO_MODE cho bản demo.</div>
            ) : null}
          </div>

          {!t.calls ? (
            <div className="d-card"><Empty>Chưa có lượt gọi Gemini trong khoảng này. Đặt GOOGLE_API_KEY trong .env để agent gọi LLM thật.</Empty></div>
          ) : (
            <>
              <div className="d-grid2">
                <div className="d-card flex flex-col gap-4">
                  <div className="text-lg">Chi phí theo ngày</div>
                  <Bars rows={data.by_day.map((r) => ({ label: r.key, value: Math.round(r.cost_usd * b.usd_to_vnd) }))} unit="đ" />
                </div>
                <div className="d-card flex flex-col gap-4">
                  <div className="text-lg">Theo model</div>
                  <Breakdown rows={data.by_model} />
                  <div className="text-lg">Theo node</div>
                  <Breakdown rows={data.by_node} />
                </div>
              </div>
              <div className="d-card flex flex-col gap-4">
                <div className="text-lg">Lượt gọi gần nhất</div>
                <div className="d-tbl-wrap">
                  <table className="d-tbl">
                    <thead><tr><th>Lúc</th><th>Node</th><th>Model</th><th>Token vào</th><th>Token ra</th><th>Chi phí</th><th>Độ trễ</th><th /></tr></thead>
                    <tbody>
                      {data.recent.map((c) => (
                        <tr key={c.id}>
                          <td className="d-faint whitespace-nowrap text-[15px]">{fmtTime(c.created_at)}</td>
                          <td>{c.node || '—'}</td>
                          <td className="d-muted text-[15px]">{c.model}</td>
                          <td className="tabular-nums">{fmtInt(c.input_tokens)}</td>
                          <td className="tabular-nums">{fmtInt(c.output_tokens)}</td>
                          <td className="tabular-nums">{fmtUsd(c.cost_usd)}</td>
                          <td className="tabular-nums">{fmtInt(c.latency_ms)} ms</td>
                          <td>{c.ok ? <span className="d-chip d-ok">OK</span> : <span className="d-chip d-lock" title={c.error || ''}>Lỗi</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
          <div className="d-faint px-2 text-[14px]">
            Giá tính (USD / 1 triệu token, vào · ra): {Object.entries(data.prices).map(([m, [i, o]]) => `${m} ${i} · ${o}`).join(' — ')}. Sửa ở .env (PRICE_*).
          </div>
        </>
      )}
    </Shell>
  );
}

function Breakdown({ rows }: { rows: UsageRow[] }) {
  if (!rows.length) return <Empty>Chưa có dữ liệu.</Empty>;
  return (
    <table className="d-tbl">
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>{r.key || '—'}</td>
            <td className="d-muted tabular-nums">{fmtInt(r.calls)} lượt</td>
            <td className="d-muted tabular-nums">{fmtTokens(r.tokens)}</td>
            <td className="tabular-nums">{fmtUsd(r.cost_usd)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

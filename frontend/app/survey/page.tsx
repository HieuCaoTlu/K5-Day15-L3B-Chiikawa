'use client';

// Trang điền khảo sát công khai (/survey?slug=...). Đã gửi đúng link cho đúng vai trò nên không hỏi lại vai trò.
import { useEffect, useState, type FormEvent } from 'react';
import { api, type Survey } from '@/lib/api';
import { ErrorBox, Icon, Loading } from '@/components/kit/ui';

export default function PublicSurveyPage() {
  const [slug, setSlug] = useState<string | null>(null);
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('slug')?.trim() || '';
    setSlug(param);
    if (!param) {
      setLoading(false);
      setError('Thiếu mã khảo sát trên đường dẫn (?slug=...).');
      return;
    }
    api
      .survey(param)
      .then((data) => {
        setSurvey(data);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Không tải được form khảo sát'))
      .finally(() => setLoading(false));
  }, []);

  const setAnswer = (qid: string, val: string) => setAnswers((prev) => ({ ...prev, [qid]: val }));
  const toggleMulti = (qid: string, opt: string) =>
    setAnswers((prev) => {
      const cur = Array.isArray(prev[qid]) ? prev[qid] : [];
      return { ...prev, [qid]: cur.includes(opt) ? cur.filter((item) => item !== opt) : [...cur, opt] };
    });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!slug || !survey) return;
    for (const q of survey.questions) {
      const raw = answers[q.id];
      const missing = Array.isArray(raw) ? raw.length === 0 : !String(raw || '').trim();
      if (q.required && missing) {
        setError(`Vui lòng trả lời câu hỏi: ${q.q}`);
        return;
      }
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.submitSurveyResponse(slug, {
        respondent_role: survey.target_role || '',
        answers,
        is_sample: false,
      });
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không gửi được câu trả lời');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setAnswers({});
    setSubmitted(false);
    setError(null);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-[720px] flex-col gap-3 px-3 py-6">
      <div className="d-card flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="d-ov">Khảo sát người dùng</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {survey?.target_role && <span className="d-chip d-info">Dành cho: {survey.target_role}</span>}
            {survey && <span className="d-chip d-mute">{survey.project_name}</span>}
          </div>
        </div>
        {loading ? (
          <Loading />
        ) : !survey ? (
          <>
            <ErrorBox message={error || 'Không tìm thấy khảo sát.'} />
            <div>
              <a href="/" className="d-btn d-b2 d-sm">
                <Icon name="back" size={16} />
                Quay lại Tầng
              </a>
            </div>
          </>
        ) : submitted ? (
          <div className="flex flex-col gap-4">
            <h1 className="d-h1">{survey.title}</h1>
            <div className="d-alert ok">
              Cảm ơn bạn đã hoàn thành khảo sát. Câu trả lời đã được ghi nhận vào hệ thống.
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="d-btn d-b2 d-sm" onClick={resetForm}>
                Gửi thêm phản hồi khác
              </button>
              <a href="/" className="d-btn d-b2 d-sm">
                Về Tầng Workstation
              </a>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <h1 className="d-h1">{survey.title}</h1>
              {survey.description && <p className="d-muted m-0 text-[16px] leading-relaxed">{survey.description}</p>}
            </div>

            <ErrorBox message={error} />

            {survey.questions.map((q, idx) => {
              const rawVal = answers[q.id];
              const value = typeof rawVal === 'string' ? rawVal : '';
              const multiValues = Array.isArray(rawVal) ? rawVal : [];
              return (
                <div key={q.id} className="flex flex-col gap-2.5 rounded-2xl bg-soft p-4">
                  <div className="text-[17px] leading-snug">
                    {idx + 1}. {q.q}
                    {q.type === 'multi' && <span className="d-muted ml-1 text-[14px]">(chọn nhiều)</span>}
                    {q.required && <span className="d-muted ml-1 text-[14px]">(bắt buộc)</span>}
                  </div>

                  {(q.type === 'choice' || q.type === 'multi') && (
                    <div className="flex flex-col gap-2">
                      {q.options.map((opt) => {
                        const isMulti = q.type === 'multi';
                        const selected = isMulti ? multiValues.includes(opt) : value === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => (isMulti ? toggleMulti(q.id, opt) : setAnswer(q.id, opt))}
                            aria-pressed={selected}
                            className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-[15px] transition-colors ${
                              selected
                                ? 'border-brand bg-pale text-brand-dark'
                                : 'border-line bg-white text-ink hover:bg-soft-hover'
                            }`}
                          >
                            <span
                              className={`inline-flex size-4 flex-none items-center justify-center border ${
                                isMulti ? 'rounded' : 'rounded-full'
                              } ${selected ? 'border-brand bg-brand text-white' : 'border-line-strong bg-white'}`}
                            >
                              {isMulti && selected ? <Icon name="check" size={12} /> : null}
                            </span>
                            <span>{opt}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {q.type === 'scale' && (
                    <div className="flex flex-col gap-2">
                      <div className="grid grid-cols-5 gap-2">
                        {['1', '2', '3', '4', '5'].map((n) => {
                          const selected = value === n;
                          return (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setAnswer(q.id, n)}
                              aria-pressed={selected}
                              className={`min-h-[44px] cursor-pointer rounded-xl border text-[16px] tabular-nums transition-colors ${
                                selected
                                  ? 'border-brand bg-brand text-white'
                                  : 'border-line bg-white text-ink hover:bg-soft-hover'
                              }`}
                            >
                              {n}
                            </button>
                          );
                        })}
                      </div>
                      <div className="d-faint flex justify-between text-[13px]">
                        <span>1 · Rất ít</span>
                        <span>5 · Rất nhiều</span>
                      </div>
                    </div>
                  )}

                  {q.type === 'text' && (
                    <textarea
                      className="d-ta"
                      value={value}
                      maxLength={1000}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                      placeholder="Nhập chia sẻ ngắn gọn của bạn…"
                    />
                  )}
                </div>
              );
            })}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="submit" className="d-btn d-b1" disabled={submitting} aria-busy={submitting}>
                {submitting ? <span className="d-spin" /> : <Icon name="check" />}
                Gửi câu trả lời
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

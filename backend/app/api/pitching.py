"""API cho chức năng Pitching: sinh form khảo sát theo 1 vai mục tiêu, publish link và nhận phản hồi."""

import re
import unicodedata
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.agent.pitching_gen import (
    generate_pitch_assets,
    generate_pitch_deck,
    generate_pitch_overview,
    generate_survey,
)
from app.db import get_session
from app.models import PitchDeck, PitchSurvey, PitchSurveyResponse
from app.schemas import (
    PitchAdPost,
    PitchAssetsGenerateIn,
    PitchAssetsOut,
    PitchDeckDraftOut,
    PitchDeckGenerateIn,
    PitchDeckOut,
    PitchDeckPublishIn,
    PitchOverviewIn,
    PitchOverviewOut,
    PitchSlide,
    ProblemContextIn,
    SurveyDraftOut,
    SurveyOptionStat,
    SurveyOut,
    SurveyPublishIn,
    SurveyQuestion,
    SurveyQuestionStat,
    SurveyResponseIn,
    SurveyResponseOut,
    SurveySection,
    SurveyStatsOut,
)

router = APIRouter(prefix="/pitching", tags=["pitching"])


def _slugify(name: str) -> str:
    norm = unicodedata.normalize("NFKD", name.replace("đ", "d").replace("Đ", "D"))
    ascii_text = norm.encode("ascii", "ignore").decode("ascii").lower()
    cleaned = re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-")
    prefix = (cleaned[:28].rstrip("-")) or "khao-sat"
    return f"{prefix}-{uuid4().hex[:6]}"


def _survey_role(survey: PitchSurvey) -> str:
    ctx = dict(survey.problem_context or {})
    return str(ctx.get("target_role") or ctx.get("persona") or "").strip()[:120]


def _to_survey_out(survey: PitchSurvey, count: int) -> SurveyOut:
    ctx = dict(survey.problem_context or {})
    raw_sections = ctx.get("sections") or []
    sections = [SurveySection.model_validate(s) for s in raw_sections if isinstance(s, dict) and s.get("title")]
    return SurveyOut(
        id=survey.id,
        slug=survey.slug,
        project_name=survey.project_name,
        target_role=_survey_role(survey),
        problem_context=ctx,
        title=survey.title,
        description=survey.description,
        sections=sections,
        questions=[SurveyQuestion.model_validate(q) for q in (survey.questions or [])],
        published=survey.published,
        response_count=count,
        created_at=survey.created_at,
        updated_at=survey.updated_at,
    )


@router.post("/surveys/generate", response_model=SurveyDraftOut)
def generate_survey_draft(body: ProblemContextIn) -> SurveyDraftOut:
    """Tạo nháp form khảo sát bám sát bài toán đang làm và đúng 1 vai mục tiêu."""
    return generate_survey(body)


def _normalize_sections(sections: list[SurveySection]) -> list[dict]:
    normalized: list[dict] = []
    seen: set[str] = set()
    for idx, sec in enumerate(sections):
        title = sec.title.strip()
        if not title:
            continue
        sec_id = sec.id.strip() or f"s{idx}"
        if sec_id in seen:
            sec_id = f"s{idx}_{uuid4().hex[:4]}"
        seen.add(sec_id)
        normalized.append(
            SurveySection(
                id=sec_id[:24],
                title=title[:140],
                description=sec.description.strip()[:400],
            ).model_dump()
        )
    return normalized


def _normalize_questions(questions: list[SurveyQuestion], section_ids: list[str] | None = None) -> list[dict]:
    valid_secs = set(section_ids or [])
    first_sec = section_ids[0] if section_ids else ""
    normalized = []
    for idx, q in enumerate(questions):
        opts = [o.strip() for o in q.options if o.strip()] if q.type in ("choice", "multi") else []
        if q.type in ("choice", "multi") and len(opts) < 2:
            raise HTTPException(422, f"Câu hỏi lựa chọn #{idx + 1} cần ít nhất 2 phương án")
        sec_id = q.section_id.strip()
        if valid_secs:
            sec_id = sec_id if sec_id in valid_secs else first_sec
        normalized.append(
            SurveyQuestion(
                id=q.id.strip() or f"q{idx}",
                section_id=sec_id,
                type=q.type,
                q=q.q.strip(),
                options=opts,
                required=q.required,
            ).model_dump()
        )
    return normalized


def _prepare_survey_payload(body: SurveyPublishIn, base_ctx: dict | None = None) -> tuple[dict, list[dict]]:
    normalized_sections = _normalize_sections(body.sections)
    section_ids = [s["id"] for s in normalized_sections]
    normalized_questions = _normalize_questions(body.questions, section_ids)
    ctx = dict(base_ctx or {})
    if body.problem_context:
        ctx.update(body.problem_context)
    ctx["target_role"] = body.target_role.strip()
    ctx["sections"] = normalized_sections
    return ctx, normalized_questions


@router.post("/surveys", response_model=SurveyOut, status_code=201)
def publish_survey(body: SurveyPublishIn, session: Session = Depends(get_session)) -> SurveyOut:
    """Lưu và publish form khảo sát để lấy link công khai cho người dùng điền."""
    ctx, normalized_questions = _prepare_survey_payload(body)
    slug_seed = f"{body.project_name}-{body.target_role}" if body.target_role.strip() else body.project_name
    survey = PitchSurvey(
        id=uuid4().hex,
        slug=_slugify(slug_seed),
        project_name=body.project_name.strip(),
        problem_context=ctx,
        title=body.title.strip(),
        description=body.description.strip(),
        questions=normalized_questions,
        published=True,
    )
    session.add(survey)
    session.commit()
    session.refresh(survey)
    return _to_survey_out(survey, 0)


@router.get("/surveys", response_model=list[SurveyOut])
def list_surveys(session: Session = Depends(get_session)) -> list[SurveyOut]:
    """Liệt kê các form khảo sát đã publish (30 form gần nhất)."""
    surveys = session.scalars(select(PitchSurvey).order_by(PitchSurvey.created_at.desc()).limit(30)).all()
    if not surveys:
        return []
    counts = dict(
        session.execute(
            select(PitchSurveyResponse.survey_id, func.count(PitchSurveyResponse.id))
            .where(PitchSurveyResponse.survey_id.in_([s.id for s in surveys]))
            .group_by(PitchSurveyResponse.survey_id)
        ).all()
    )
    return [_to_survey_out(s, int(counts.get(s.id, 0))) for s in surveys]


@router.get("/surveys/{slug}", response_model=SurveyOut)
def get_survey(slug: str, session: Session = Depends(get_session)) -> SurveyOut:
    """Lấy form khảo sát theo slug công khai."""
    survey = session.scalar(select(PitchSurvey).where(PitchSurvey.slug == slug))
    if survey is None or not survey.published:
        raise HTTPException(404, "Không tìm thấy form khảo sát")
    count = session.scalar(select(func.count(PitchSurveyResponse.id)).where(PitchSurveyResponse.survey_id == survey.id))
    return _to_survey_out(survey, int(count or 0))


@router.put("/surveys/{slug}", response_model=SurveyOut)
def update_survey(slug: str, body: SurveyPublishIn, session: Session = Depends(get_session)) -> SurveyOut:
    """Cập nhật nội dung và câu hỏi của form khảo sát đã publish (giữ nguyên link & phản hồi cũ)."""
    survey = session.scalar(select(PitchSurvey).where(PitchSurvey.slug == slug))
    if survey is None:
        raise HTTPException(404, "Không tìm thấy form khảo sát")
    ctx, normalized_questions = _prepare_survey_payload(body, dict(survey.problem_context or {}))
    survey.project_name = body.project_name.strip()
    survey.problem_context = ctx
    survey.title = body.title.strip()
    survey.description = body.description.strip()
    survey.questions = normalized_questions
    session.commit()
    session.refresh(survey)
    count = session.scalar(select(func.count(PitchSurveyResponse.id)).where(PitchSurveyResponse.survey_id == survey.id))
    return _to_survey_out(survey, int(count or 0))


@router.delete("/surveys/{slug}", status_code=204)
def delete_survey(slug: str, session: Session = Depends(get_session)) -> None:
    """Xoá một form khảo sát đã publish cùng các phản hồi của nó."""
    survey = session.scalar(select(PitchSurvey).where(PitchSurvey.slug == slug))
    if survey is None:
        raise HTTPException(404, "Không tìm thấy form khảo sát")
    session.execute(delete(PitchSurveyResponse).where(PitchSurveyResponse.survey_id == survey.id))
    session.delete(survey)
    session.commit()


@router.post("/surveys/{slug}/responses", response_model=SurveyResponseOut, status_code=201)
def submit_response(slug: str, body: SurveyResponseIn, session: Session = Depends(get_session)) -> PitchSurveyResponse:
    """Nhận một lượt điền khảo sát từ link công khai."""
    survey = session.scalar(select(PitchSurvey).where(PitchSurvey.slug == slug))
    if survey is None or not survey.published:
        raise HTTPException(404, "Không tìm thấy form khảo sát")

    questions = [SurveyQuestion.model_validate(q) for q in (survey.questions or [])]
    cleaned_answers: dict[str, str | list[str]] = {}
    for q in questions:
        raw_val = body.answers.get(q.id, [] if q.type == "multi" else "")
        if q.type == "multi":
            items = raw_val if isinstance(raw_val, list) else ([raw_val] if str(raw_val).strip() else [])
            selected = list(dict.fromkeys(str(item).strip() for item in items if str(item).strip()))
            if q.required and not selected:
                raise HTTPException(422, f"Vui lòng trả lời câu hỏi: {q.q}")
            if not selected:
                continue
            if any(item not in q.options for item in selected):
                raise HTTPException(422, f"Lựa chọn không hợp lệ cho câu {q.id}")
            cleaned_answers[q.id] = [item[:200] for item in selected]
            continue

        val = str(raw_val if not isinstance(raw_val, list) else (raw_val[0] if raw_val else "")).strip()
        if q.required and not val:
            raise HTTPException(422, f"Vui lòng trả lời câu hỏi: {q.q}")
        if not val:
            continue
        if q.type == "scale" and val not in {"1", "2", "3", "4", "5"}:
            raise HTTPException(422, f"Giá trị thang điểm không hợp lệ cho câu {q.id}")
        if q.type == "choice" and val not in q.options:
            raise HTTPException(422, f"Lựa chọn không hợp lệ cho câu {q.id}")
        cleaned_answers[q.id] = val[:1000]

    ctx = dict(survey.problem_context or {})
    default_role = str(ctx.get("target_role") or ctx.get("persona") or "").strip()[:120]
    inferred_role = body.respondent_role.strip()[:120] or default_role

    resp = PitchSurveyResponse(
        survey_id=survey.id,
        respondent_role=inferred_role,
        answers=cleaned_answers,
        is_sample=body.is_sample,
    )
    session.add(resp)
    session.commit()
    session.refresh(resp)
    return resp


def _extract_multi(raw: object) -> list[str]:
    if isinstance(raw, list):
        return list(dict.fromkeys(str(item).strip() for item in raw if str(item).strip()))
    val = str(raw or "").strip()
    return [val] if val else []


def _aggregate_question(q: SurveyQuestion, rows: list[PitchSurveyResponse]) -> SurveyQuestionStat:
    """Tính số lượng, phần trăm (%) và điểm trung bình cho 1 câu hỏi hoàn toàn bằng Python."""
    if q.type == "text":
        texts = [
            str(v).strip() for r in rows if (v := r.answers.get(q.id)) and not isinstance(v, list) and str(v).strip()
        ]
        return SurveyQuestionStat(id=q.id, type=q.type, q=q.q, answered=len(texts), texts=texts[:20])

    if q.type == "multi":
        selections = [_extract_multi(r.answers.get(q.id)) for r in rows]
        non_empty = [sel for sel in selections if sel]
        answered = len(non_empty)
        counts: dict[str, int] = {opt: 0 for opt in q.options}
        for sel in non_empty:
            for item in sel:
                counts[item] = counts.get(item, 0) + 1
        opts = [
            SurveyOptionStat(label=lbl, count=cnt, pct=round(cnt / answered * 100, 1) if answered else 0.0)
            for lbl, cnt in counts.items()
        ]
        return SurveyQuestionStat(id=q.id, type=q.type, q=q.q, answered=answered, options=opts)

    base_labels = ["1", "2", "3", "4", "5"] if q.type == "scale" else list(q.options)
    counts = {lbl: 0 for lbl in base_labels}
    answered = 0
    scale_sum = 0
    for r in rows:
        raw = r.answers.get(q.id)
        val = str(raw[0] if isinstance(raw, list) and raw else raw or "").strip()
        if not val:
            continue
        if q.type == "scale":
            if val not in {"1", "2", "3", "4", "5"}:
                continue
            scale_sum += int(val)
        answered += 1
        counts[val] = counts.get(val, 0) + 1

    opts = [
        SurveyOptionStat(label=lbl, count=cnt, pct=round(cnt / answered * 100, 1) if answered else 0.0)
        for lbl, cnt in counts.items()
    ]
    avg = round(scale_sum / answered, 2) if q.type == "scale" and answered else None
    return SurveyQuestionStat(id=q.id, type=q.type, q=q.q, answered=answered, avg=avg, options=opts)


def _build_survey_stats(survey: PitchSurvey, session: Session) -> SurveyStatsOut:
    rows = list(
        session.scalars(
            select(PitchSurveyResponse)
            .where(PitchSurveyResponse.survey_id == survey.id)
            .order_by(PitchSurveyResponse.created_at.desc())
        ).all()
    )
    questions = [SurveyQuestion.model_validate(q) for q in (survey.questions or [])]
    sample_count = sum(1 for r in rows if r.is_sample)
    total = len(rows)
    return SurveyStatsOut(
        survey_id=survey.id,
        slug=survey.slug,
        title=survey.title,
        target_role=_survey_role(survey),
        total_responses=total,
        real_responses=total - sample_count,
        sample_responses=sample_count,
        last_response_at=rows[0].created_at if rows else None,
        questions=[_aggregate_question(q, rows) for q in questions],
    )


@router.get("/surveys/{slug}/responses", response_model=list[SurveyResponseOut])
def list_responses(slug: str, session: Session = Depends(get_session)) -> list[PitchSurveyResponse]:
    """Liệt kê các phản hồi gần nhất của một khảo sát."""
    survey = session.scalar(select(PitchSurvey).where(PitchSurvey.slug == slug))
    if survey is None:
        raise HTTPException(404, "Không tìm thấy form khảo sát")
    return list(
        session.scalars(
            select(PitchSurveyResponse)
            .where(PitchSurveyResponse.survey_id == survey.id)
            .order_by(PitchSurveyResponse.created_at.desc())
            .limit(100)
        ).all()
    )


@router.get("/surveys/{slug}/stats", response_model=SurveyStatsOut)
def get_survey_stats(slug: str, session: Session = Depends(get_session)) -> SurveyStatsOut:
    """Trả về thống kê dashboard (% và đếm từng phương án) tính bằng Python."""
    survey = session.scalar(select(PitchSurvey).where(PitchSurvey.slug == slug))
    if survey is None:
        raise HTTPException(404, "Không tìm thấy form khảo sát")
    return _build_survey_stats(survey, session)


@router.post("/surveys/{slug}/samples", response_model=SurveyStatsOut, status_code=201)
def seed_survey_samples(slug: str, session: Session = Depends(get_session)) -> SurveyStatsOut:
    """Thêm 8 phản hồi mẫu (is_sample=True) để kiểm thử biểu đồ dashboard ngay khi chưa thu đủ người thật."""
    survey = session.scalar(select(PitchSurvey).where(PitchSurvey.slug == slug))
    if survey is None or not survey.published:
        raise HTTPException(404, "Không tìm thấy form khảo sát")

    questions = [SurveyQuestion.model_validate(q) for q in (survey.questions or [])]
    sample_texts = [
        "Cần có trích dẫn rõ nguồn để yên tâm dùng",
        "Ngại thao tác rườm rà khi đang vội",
        "Muốn dùng thử miễn phí trước khi trả tiền",
        "Lo AI trả lời lệch quy định hoặc sai số liệu",
        "Đang tìm cách tổng hợp nhanh hơn cách cũ",
    ]
    role = _survey_role(survey)
    for i in range(8):
        answers: dict[str, str | list[str]] = {}
        for k, q in enumerate(questions):
            if q.type == "scale":
                answers[q.id] = str(2 + ((i * 7 + k * 3) % 4))
            elif q.type == "multi" and q.options:
                pick1 = q.options[(i + k) % len(q.options)]
                pick2 = q.options[(i + k + 1) % len(q.options)]
                answers[q.id] = list(dict.fromkeys([pick1, pick2]))
            elif q.type == "choice" and q.options:
                answers[q.id] = q.options[(i * i + k) % len(q.options)]
            else:
                answers[q.id] = sample_texts[(i + k) % len(sample_texts)]
        session.add(
            PitchSurveyResponse(
                survey_id=survey.id,
                respondent_role=role,
                answers=answers,
                is_sample=True,
            )
        )
    session.commit()
    return _build_survey_stats(survey, session)


def _lookup_stats(survey_slug: str, session: Session) -> SurveyStatsOut | None:
    cleaned = survey_slug.strip()
    if not cleaned or cleaned == "__none__":
        return None
    survey = session.scalar(select(PitchSurvey).where(PitchSurvey.slug == cleaned))
    if survey is None:
        return None
    return _build_survey_stats(survey, session)


def _to_deck_out(deck: PitchDeck) -> PitchDeckOut:
    return PitchDeckOut(
        id=deck.id,
        slug=deck.slug,
        project_name=deck.project_name,
        survey_slug=deck.survey_slug,
        title=deck.title,
        slides=[PitchSlide.model_validate(s) for s in (deck.slides or [])],
        script=deck.script or "",
        ads=[PitchAdPost.model_validate(a) for a in (deck.ads or [])],
        created_at=deck.created_at,
        updated_at=deck.updated_at,
    )


def _normalize_slides(slides: list[PitchSlide]) -> list[dict]:
    if len(slides) > 10:
        raise HTTPException(422, "Bộ slide pitching tối đa 10 slide")
    normalized = []
    for idx, slide in enumerate(slides):
        normalized.append(
            PitchSlide(
                id=slide.id.strip() or f"s{idx}",
                kicker=slide.kicker.strip()[:80],
                title=slide.title.strip(),
                body=slide.body.strip(),
                highlight=slide.highlight.strip()[:140],
            ).model_dump()
        )
    return normalized


def _normalize_ads(ads: list[PitchAdPost]) -> list[dict]:
    return [
        PitchAdPost(
            id=ad.id.strip() or f"ad{idx}",
            channel=ad.channel.strip(),
            hook=ad.hook.strip(),
            body=ad.body.strip(),
            cta=ad.cta.strip(),
            placeholders=[p.strip() for p in ad.placeholders if p.strip()][:8],
        ).model_dump()
        for idx, ad in enumerate(ads[:6])
    ]


@router.post("/decks/generate", response_model=PitchDeckDraftOut)
def generate_deck_draft(body: PitchDeckGenerateIn, session: Session = Depends(get_session)) -> PitchDeckDraftOut:
    """Sinh nháp tối đa 10 slide Pitching HTML từ Product thinking + khảo sát đã chọn."""
    stats = _lookup_stats(body.survey_slug, session)
    return generate_pitch_deck(body.context, stats, body.slide_count)


@router.post("/decks", response_model=PitchDeckOut, status_code=201)
def publish_deck(body: PitchDeckPublishIn, session: Session = Depends(get_session)) -> PitchDeckOut:
    """Lưu & tạo link công khai cho bộ slide Pitching HTML (/pitch?slug=...)."""
    deck = PitchDeck(
        id=uuid4().hex,
        slug=_slugify(body.title or body.project_name),
        project_name=body.project_name.strip(),
        survey_slug=body.survey_slug.strip(),
        title=body.title.strip(),
        slides=_normalize_slides(body.slides),
        script=body.script.strip(),
        ads=_normalize_ads(body.ads),
    )
    session.add(deck)
    session.commit()
    session.refresh(deck)
    return _to_deck_out(deck)


@router.get("/decks", response_model=list[PitchDeckOut])
def list_decks(session: Session = Depends(get_session)) -> list[PitchDeckOut]:
    """Liệt kê tối đa 20 bộ slide pitching đã lưu."""
    rows = session.scalars(select(PitchDeck).order_by(PitchDeck.created_at.desc()).limit(20)).all()
    return [_to_deck_out(row) for row in rows]


@router.get("/decks/{slug}", response_model=PitchDeckOut)
def get_deck(slug: str, session: Session = Depends(get_session)) -> PitchDeckOut:
    """Lấy bộ slide pitching theo slug công khai."""
    deck = session.scalar(select(PitchDeck).where(PitchDeck.slug == slug))
    if deck is None:
        raise HTTPException(404, "Không tìm thấy bộ slide pitching")
    return _to_deck_out(deck)


@router.put("/decks/{slug}", response_model=PitchDeckOut)
def update_deck(slug: str, body: PitchDeckPublishIn, session: Session = Depends(get_session)) -> PitchDeckOut:
    """Cập nhật nội dung slide / kịch bản / bài quảng cáo và giữ nguyên slug công khai."""
    deck = session.scalar(select(PitchDeck).where(PitchDeck.slug == slug))
    if deck is None:
        raise HTTPException(404, "Không tìm thấy bộ slide pitching")
    deck.project_name = body.project_name.strip()
    deck.survey_slug = body.survey_slug.strip()
    deck.title = body.title.strip()
    deck.slides = _normalize_slides(body.slides)
    deck.script = body.script.strip()
    deck.ads = _normalize_ads(body.ads)
    session.commit()
    session.refresh(deck)
    return _to_deck_out(deck)


@router.delete("/decks/{slug}", status_code=204)
def delete_deck(slug: str, session: Session = Depends(get_session)) -> None:
    """Xoá một bộ slide pitching đã lưu."""
    deck = session.scalar(select(PitchDeck).where(PitchDeck.slug == slug))
    if deck is None:
        raise HTTPException(404, "Không tìm thấy bộ slide pitching")
    session.delete(deck)
    session.commit()


@router.post("/assets/generate", response_model=PitchAssetsOut)
def generate_assets(body: PitchAssetsGenerateIn, session: Session = Depends(get_session)) -> PitchAssetsOut:
    """Sinh bài quảng cáo chung kèm placeholder từ Product thinking + khảo sát."""
    stats = _lookup_stats(body.survey_slug, session)
    return generate_pitch_assets(body.context, stats)


@router.post("/overview", response_model=PitchOverviewOut)
def generate_overview(body: PitchOverviewIn, session: Session = Depends(get_session)) -> PitchOverviewOut:
    """Tạo AI overview phân tích tín hiệu từ số liệu khảo sát đã tính bằng Python."""
    stats = _lookup_stats(body.survey_slug, session)
    return generate_pitch_overview(body.context, stats)

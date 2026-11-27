"""API cho chức năng Pitching: sinh form khảo sát theo 1 vai mục tiêu, publish link và nhận phản hồi."""

import re
import unicodedata
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.agent.pitching_gen import generate_survey
from app.db import get_session
from app.models import PitchSurvey, PitchSurveyResponse
from app.schemas import (
    ProblemContextIn,
    SurveyDraftOut,
    SurveyOut,
    SurveyPublishIn,
    SurveyQuestion,
    SurveyResponseIn,
    SurveyResponseOut,
)

router = APIRouter(prefix="/pitching", tags=["pitching"])


def _slugify(name: str) -> str:
    norm = unicodedata.normalize("NFKD", name.replace("đ", "d").replace("Đ", "D"))
    ascii_text = norm.encode("ascii", "ignore").decode("ascii").lower()
    cleaned = re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-")
    prefix = (cleaned[:28].rstrip("-")) or "khao-sat"
    return f"{prefix}-{uuid4().hex[:6]}"


def _to_survey_out(survey: PitchSurvey, count: int) -> SurveyOut:
    ctx = dict(survey.problem_context or {})
    role = str(ctx.get("target_role") or ctx.get("persona") or "").strip()[:120]
    return SurveyOut(
        id=survey.id,
        slug=survey.slug,
        project_name=survey.project_name,
        target_role=role,
        problem_context=ctx,
        title=survey.title,
        description=survey.description,
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


@router.post("/surveys", response_model=SurveyOut, status_code=201)
def publish_survey(body: SurveyPublishIn, session: Session = Depends(get_session)) -> SurveyOut:
    """Lưu và publish form khảo sát để lấy link công khai cho người dùng điền."""
    normalized_questions = []
    for idx, q in enumerate(body.questions):
        opts = [o.strip() for o in q.options if o.strip()] if q.type in ("choice", "multi") else []
        if q.type in ("choice", "multi") and len(opts) < 2:
            raise HTTPException(422, f"Câu hỏi lựa chọn #{idx + 1} cần ít nhất 2 phương án")
        normalized_questions.append(
            SurveyQuestion(
                id=q.id.strip() or f"q{idx}",
                type=q.type,
                q=q.q.strip(),
                options=opts,
                required=q.required,
            ).model_dump()
        )
    ctx = dict(body.problem_context or {})
    if body.target_role.strip():
        ctx["target_role"] = body.target_role.strip()
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

"""Gợi ý cách kiếm tiền cho tab Quality: gọi LLM, lỗi hoặc chưa có key thì dùng luật dự phòng."""

import logging

from pydantic import BaseModel, Field

from app.agent import llm
from app.agent.prompts import render
from app.schemas import ProblemContextIn

logger = logging.getLogger("app.money_tips")


class MoneyTipsIn(BaseModel):
    context: ProblemContextIn
    monthly_cost_usd: float | None = Field(default=None, ge=0, le=1e9)


class MoneyTipOut(BaseModel):
    title: str
    how: str
    why: str = ""


class MoneyTipsOut(BaseModel):
    tips: list[MoneyTipOut]
    source: str  # "llm" hoặc "fallback"


class _Generated(BaseModel):
    tips: list[MoneyTipOut] = Field(min_length=1, max_length=6)


RULE_TIPS = [
    MoneyTipOut(
        title="Thuê bao theo đội mỗi tháng",
        how="Cho dùng thử miễn phí 14 ngày, sau đó thu phí cố định mỗi đội. Bắt đầu với vài khách quen để chốt mức giá.",
        why="Dễ dự đoán doanh thu và hợp với sản phẩm được dùng hằng ngày.",
    ),
    MoneyTipOut(
        title="Tính tiền theo lượt dùng AI",
        how="Tặng một hạn mức miễn phí mỗi tháng, vượt mức thì tính theo gói lượt. Hiện số lượt đã dùng ngay trong sản phẩm.",
        why="Chi phí AI tăng theo lượt gọi, nên thu theo lượt giúp không lỗ khi khách dùng nhiều.",
    ),
    MoneyTipOut(
        title="Gói triển khai và tùy chỉnh",
        how="Thu phí một lần để nối sản phẩm vào dữ liệu và quy trình riêng của khách, kèm phí duy trì nhỏ hằng tháng.",
        why="Khách doanh nghiệp sẵn sàng trả cho phần tích hợp mà họ không tự làm được.",
    ),
]


def _clean(tips: list[MoneyTipOut]) -> list[MoneyTipOut]:
    out = []
    for t in tips[:5]:
        title, how = t.title.strip()[:120], t.how.strip()[:400]
        if title and how:
            out.append(MoneyTipOut(title=title, how=how, why=t.why.strip()[:240]))
    return out


def generate_money_tips(body: MoneyTipsIn) -> MoneyTipsOut:
    ctx = body.context
    cost = (
        f"Chi phí AI và hạ tầng đội ước tính: khoảng {body.monthly_cost_usd:.2f} USD mỗi tháng."
        if body.monthly_cost_usd is not None
        else "Chưa đủ dữ liệu chi phí."
    )
    prompt = render(
        "money_tips",
        project_name=ctx.project_name.strip() or "Sản phẩm AI",
        target_role=ctx.target_role.strip() or "(chưa rõ)",
        persona=ctx.persona.strip() or "(chưa rõ)",
        problem=ctx.problem.strip() or "(chưa điền)",
        leverage=ctx.leverage.strip() or "(chưa điền)",
        scope=ctx.scope.strip() or "(chưa điền)",
        metric=ctx.metric.strip() or "(chưa điền)",
        overview=ctx.overview.strip() or "(chưa có)",
        cost=cost,
    )
    try:
        tips = _clean(llm.structured(_Generated, prompt, node="money_tips").tips)
        if tips:
            # Luôn đủ ít nhất 3 cách: thiếu thì thêm từ gợi ý mẫu, không trùng tên.
            seen = {t.title.lower() for t in tips}
            tips += [t for t in RULE_TIPS if t.title.lower() not in seen][: max(0, 3 - len(tips))]
            return MoneyTipsOut(tips=tips, source="llm")
    except llm.LLMUnavailableError:
        pass
    except Exception as exc:  # noqa: BLE001 — lỗi LLM thì dùng luật dự phòng
        logger.warning("money_tips: LLM lỗi (%s), dùng luật dự phòng", type(exc).__name__)
    return MoneyTipsOut(tips=RULE_TIPS, source="fallback")

"""API tab Quality: agent gợi ý cách kiếm tiền."""

from fastapi import APIRouter, Depends

from app.agent.money_tips import MoneyTipsIn, MoneyTipsOut, generate_money_tips
from app.planning.auth import require_same_origin

# Chỉ nhận yêu cầu từ chính trang ProductPilot (như các API Planning) để trang khác không tiêu ngân sách LLM.
router = APIRouter(prefix="/quality", tags=["quality"], dependencies=[Depends(require_same_origin)])


@router.post("/money-tips", response_model=MoneyTipsOut)
def money_tips(body: MoneyTipsIn) -> MoneyTipsOut:
    """Gợi ý 3–5 cách kiếm tiền từ bài toán ở Thinking và chi phí AI đội đã ước tính."""
    return generate_money_tips(body)

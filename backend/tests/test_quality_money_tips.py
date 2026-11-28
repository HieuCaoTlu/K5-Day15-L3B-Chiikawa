"""Agent gợi ý cách kiếm tiền: có LLM thì dùng kết quả LLM, không có thì dùng luật dự phòng."""

from app.agent import llm, money_tips

WRITE = {"X-Planning-Request": "1"}

CONTEXT = {
    "project_name": "Đáp Nhanh",
    "target_role": "Nhân viên CSKH",
    "problem": "Trả lời khách chậm vì phải tra chính sách thủ công.",
}


def test_fallback_when_llm_unavailable(client, monkeypatch):
    def unavailable(*args, **kwargs):
        raise llm.LLMUnavailableError("không có key")

    monkeypatch.setattr(llm, "structured", unavailable)
    res = client.post("/api/v1/quality/money-tips", json={"context": CONTEXT, "monthly_cost_usd": 120}, headers=WRITE)
    assert res.status_code == 200
    body = res.json()
    assert body["source"] == "fallback"
    assert len(body["tips"]) == 3
    assert all(t["title"] and t["how"] for t in body["tips"])


def test_uses_llm_tips_and_drops_empty_ones(client, monkeypatch):
    seen = {}

    def fake(schema, prompt, **kwargs):
        seen["prompt"] = prompt
        return schema(
            tips=[
                {
                    "title": "Gói theo cửa hàng",
                    "how": "Thu phí mỗi shop mỗi tháng.",
                    "why": "Shop trả lời khách hằng ngày.",
                },
                {"title": "  ", "how": "bỏ", "why": ""},
            ]
        )

    monkeypatch.setattr(money_tips.llm, "structured", fake)
    res = client.post("/api/v1/quality/money-tips", json={"context": CONTEXT}, headers=WRITE)
    body = res.json()
    assert body["source"] == "llm"
    titles = [t["title"] for t in body["tips"]]
    assert titles[0] == "Gói theo cửa hàng" and "  " not in titles
    assert len(titles) == 3  # bỏ gợi ý rỗng rồi bù từ gợi ý mẫu cho đủ 3
    assert "Đáp Nhanh" in seen["prompt"] and "Chưa đủ dữ liệu chi phí" in seen["prompt"]


def test_rejects_invalid_input(client):
    bad = {"context": {"project_name": ""}}
    assert client.post("/api/v1/quality/money-tips", json=bad, headers=WRITE).status_code == 422


def test_rejects_requests_from_other_sites(client):
    assert client.post("/api/v1/quality/money-tips", json={"context": CONTEXT}).status_code == 403

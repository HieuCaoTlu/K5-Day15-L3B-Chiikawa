"""Unit test cho API Pitching (Phần 1: 1 Form = 1 Vai chính, không hỏi lại vai trò, publish link)."""


def _sample_context(target_role: str = "Học viên") -> dict:
    return {
        "project_name": "Trợ lý TA AI lớp L3B",
        "target_role": target_role,
        "persona": target_role,
        "problem": "Học viên hay bị kẹt lỗi cài đặt và quy định nộp bài",
        "leverage": "AI tra tài liệu khóa học và trả lời nháp có nguồn",
        "scope": "Một kênh hỏi đáp pre-class",
        "metric": "Giảm 50% thời gian chờ câu trả lời",
        "overview": "Hỗ trợ hỏi đáp bài học nhanh và đúng nguồn tài liệu.",
    }


def test_generate_survey_uses_single_target_role(client):
    student_res = client.post("/api/v1/pitching/surveys/generate", json=_sample_context("Học viên"))
    assert student_res.status_code == 200
    student_body = student_res.json()
    assert student_body["source"] == "fallback"
    assert student_body["target_role"] == "Học viên"
    assert "Học viên" in student_body["title"]
    assert len(student_body["sections"]) == 2
    assert len(student_body["questions"]) == 5
    sec_ids = {s["id"] for s in student_body["sections"]}
    assert all(q["section_id"] in sec_ids for q in student_body["questions"])
    assert "vai trò" not in student_body["questions"][0]["q"].lower()
    assert "học hoặc làm bài tập" in student_body["questions"][0]["q"]

    ta_res = client.post("/api/v1/pitching/surveys/generate", json=_sample_context("Trợ giảng / Lab coach"))
    assert ta_res.status_code == 200
    ta_body = ta_res.json()
    assert ta_body["target_role"] == "Trợ giảng / Lab coach"
    assert len(ta_body["questions"]) == 5
    assert "câu hỏi lặp lại của học viên" in ta_body["questions"][0]["q"]

    custom_res = client.post(
        "/api/v1/pitching/surveys/generate",
        json={
            "project_name": "Trợ lý nhắc uống thuốc hằng ngày",
            "target_role": "Người cao tuổi",
            "problem": "Hay quên giờ uống thuốc huyết áp và nhầm liều sáng chiều",
            "leverage": "AI gọi nhắc bằng giọng nói tiếng Việt và đọc nhãn đơn thuốc",
        },
    )
    assert custom_res.status_code == 200
    custom_body = custom_res.json()
    assert custom_body["target_role"] == "Người cao tuổi"
    assert "Trợ lý nhắc uống thuốc" in custom_body["questions"][0]["q"]
    assert "Người cao tuổi" in custom_body["questions"][0]["q"]


def test_publish_survey_submit_and_delete(client):
    draft = client.post("/api/v1/pitching/surveys/generate", json=_sample_context("Học viên")).json()
    pub_res = client.post(
        "/api/v1/pitching/surveys",
        json={
            "project_name": "Trợ lý TA AI lớp L3B",
            "target_role": draft["target_role"],
            "problem_context": _sample_context("Học viên"),
            "title": draft["title"],
            "description": draft["description"],
            "sections": draft["sections"],
            "questions": draft["questions"],
        },
    )
    assert pub_res.status_code == 201
    survey = pub_res.json()
    slug = survey["slug"]
    assert survey["target_role"] == "Học viên"
    assert len(survey["sections"]) == 2
    assert survey["published"] is True

    fetched = client.get(f"/api/v1/pitching/surveys/{slug}")
    assert fetched.status_code == 200
    assert fetched.json()["response_count"] == 0

    answers = {}
    for q in survey["questions"]:
        if q["type"] == "choice":
            answers[q["id"]] = q["options"][0]
        elif q["type"] == "multi":
            answers[q["id"]] = q["options"][:2]
        elif q["type"] == "scale":
            answers[q["id"]] = "5"
        else:
            answers[q["id"]] = "Tìm lại trong chat lớp mất nhiều thời gian"

    sub_res = client.post(
        f"/api/v1/pitching/surveys/{slug}/responses",
        json={"answers": answers},
    )
    assert sub_res.status_code == 201
    assert sub_res.json()["respondent_role"] == "Học viên"

    after = client.get(f"/api/v1/pitching/surveys/{slug}").json()
    assert after["response_count"] == 1
    assert len(client.get(f"/api/v1/pitching/surveys/{slug}/responses").json()) == 1

    upd = client.put(
        f"/api/v1/pitching/surveys/{slug}",
        json={
            "project_name": "Trợ lý TA AI lớp L3B",
            "target_role": "Học viên",
            "problem_context": _sample_context("Học viên"),
            "title": "Khảo sát đã chỉnh sửa",
            "description": "Mô tả mới",
            "sections": [
                {"id": "s0", "title": "Phần 1: Đã sửa", "description": "Mô tả section 1"},
                {"id": "s_extra", "title": "Phần 2: Section mới", "description": ""},
            ],
            "questions": [
                {**draft["questions"][0], "section_id": "s0"},
                {**draft["questions"][1], "section_id": "s_extra"},
            ],
        },
    )
    assert upd.status_code == 200
    assert upd.json()["title"] == "Khảo sát đã chỉnh sửa"
    assert upd.json()["response_count"] == 1
    assert len(upd.json()["sections"]) == 2
    assert upd.json()["questions"][1]["section_id"] == "s_extra"

    assert client.delete(f"/api/v1/pitching/surveys/{slug}").status_code == 204
    assert client.get(f"/api/v1/pitching/surveys/{slug}").status_code == 404


def test_survey_validation_and_404(client):
    assert client.get("/api/v1/pitching/surveys/khong-ton-tai").status_code == 404
    assert client.delete("/api/v1/pitching/surveys/khong-ton-tai").status_code == 404

    bad_pub = client.post(
        "/api/v1/pitching/surveys",
        json={
            "project_name": "Demo",
            "title": "Form lỗi",
            "questions": [{"id": "q0", "type": "choice", "q": "Chọn một?", "options": ["Chỉ 1"], "required": True}],
        },
    )
    assert bad_pub.status_code == 422

    pub = client.post(
        "/api/v1/pitching/surveys",
        json={
            "project_name": "Demo",
            "title": "Form chuẩn",
            "questions": [
                {"id": "q0", "type": "scale", "q": "Mức độ?", "options": [], "required": True},
            ],
        },
    ).json()
    slug = pub["slug"]
    assert client.post(f"/api/v1/pitching/surveys/{slug}/responses", json={"answers": {}}).status_code == 422
    assert client.post(f"/api/v1/pitching/surveys/{slug}/responses", json={"answers": {"q0": "9"}}).status_code == 422


def test_multi_choice_survey_flow(client):
    pub = client.post(
        "/api/v1/pitching/surveys",
        json={
            "project_name": "Trợ lý L3B",
            "target_role": "Học viên",
            "title": "Form có câu chọn nhiều",
            "questions": [
                {
                    "id": "q0",
                    "type": "multi",
                    "q": "Bạn hay vướng ở các bước nào?",
                    "options": ["Cài Python", "Lỗi API key", "Chạy Docker", "Nộp bài"],
                    "required": True,
                }
            ],
        },
    )
    assert pub.status_code == 201
    slug = pub.json()["slug"]

    assert client.post(f"/api/v1/pitching/surveys/{slug}/responses", json={"answers": {"q0": []}}).status_code == 422
    assert (
        client.post(
            f"/api/v1/pitching/surveys/{slug}/responses", json={"answers": {"q0": ["Không hợp lệ"]}}
        ).status_code
        == 422
    )

    ok = client.post(
        f"/api/v1/pitching/surveys/{slug}/responses",
        json={"answers": {"q0": ["Cài Python", "Chạy Docker", "Cài Python"]}},
    )
    assert ok.status_code == 201
    assert ok.json()["answers"]["q0"] == ["Cài Python", "Chạy Docker"]


def test_survey_stats_and_sample_seeding(client):
    assert client.get("/api/v1/pitching/surveys/khong-ton-tai/stats").status_code == 404

    pub = client.post(
        "/api/v1/pitching/surveys",
        json={
            "project_name": "Trợ lý lớp L3B",
            "target_role": "Học viên",
            "title": "Khảo sát thống kê dashboard",
            "questions": [
                {"id": "q0", "type": "choice", "q": "Tần suất?", "options": ["Ít", "Nhiều"], "required": True},
                {
                    "id": "q1",
                    "type": "multi",
                    "q": "Kênh hay hỏi?",
                    "options": ["Slide", "Chat lớp", "TA"],
                    "required": True,
                },
                {"id": "q2", "type": "scale", "q": "Bất tiện?", "options": [], "required": True},
                {"id": "q3", "type": "text", "q": "Góp ý?", "options": [], "required": True},
            ],
        },
    ).json()
    slug = pub["slug"]

    client.post(
        f"/api/v1/pitching/surveys/{slug}/responses",
        json={"answers": {"q0": "Nhiều", "q1": ["Slide", "TA"], "q2": "5", "q3": "Cần nhanh"}},
    )
    client.post(
        f"/api/v1/pitching/surveys/{slug}/responses",
        json={"answers": {"q0": "Ít", "q1": ["Slide"], "q2": "3", "q3": "Có nguồn slide"}},
    )

    stats = client.get(f"/api/v1/pitching/surveys/{slug}/stats")
    assert stats.status_code == 200
    body = stats.json()
    assert body["total_responses"] == 2
    assert body["real_responses"] == 2
    assert body["sample_responses"] == 0

    q0_opts = {o["label"]: o for o in body["questions"][0]["options"]}
    assert q0_opts["Nhiều"]["pct"] == 50.0
    assert q0_opts["Ít"]["pct"] == 50.0

    q1_opts = {o["label"]: o for o in body["questions"][1]["options"]}
    assert q1_opts["Slide"]["count"] == 2
    assert q1_opts["Slide"]["pct"] == 100.0
    assert q1_opts["TA"]["pct"] == 50.0

    assert body["questions"][2]["avg"] == 4.0
    assert len(body["questions"][3]["texts"]) == 2

    seeded = client.post(f"/api/v1/pitching/surveys/{slug}/samples")
    assert seeded.status_code == 201
    after = seeded.json()
    assert after["total_responses"] == 10
    assert after["real_responses"] == 2
    assert after["sample_responses"] == 8


def test_pitch_deck_overview_and_ads_flow(client):
    survey = client.post(
        "/api/v1/pitching/surveys",
        json={
            "project_name": "Trợ lý TA AI lớp L3B",
            "target_role": "Học viên",
            "problem_context": _sample_context("Học viên"),
            "title": "Khảo sát học viên lớp L3B",
            "questions": [
                {"id": "q0", "type": "choice", "q": "Tần suất?", "options": ["Ít", "Nhiều"], "required": True},
                {"id": "q1", "type": "scale", "q": "Bất tiện?", "options": [], "required": True},
            ],
        },
    ).json()
    slug = survey["slug"]
    client.post(f"/api/v1/pitching/surveys/{slug}/samples")

    ov = client.post("/api/v1/pitching/overview", json={"context": _sample_context("Học viên"), "survey_slug": slug})
    assert ov.status_code == 200
    assert ov.json()["total_responses"] == 8
    assert ov.json()["sample_responses"] == 8
    assert "mẫu" in ov.json()["overview"].lower()

    draft_res = client.post(
        "/api/v1/pitching/decks/generate",
        json={"context": _sample_context("Học viên"), "survey_slug": slug, "slide_count": 7},
    )
    assert draft_res.status_code == 200
    draft = draft_res.json()
    assert draft["source"] == "fallback"
    assert 3 <= len(draft["slides"]) <= 10
    assert draft["survey_slug"] == slug

    assets_res = client.post(
        "/api/v1/pitching/assets/generate", json={"context": _sample_context("Học viên"), "survey_slug": slug}
    )
    assert assets_res.status_code == 200
    assets = assets_res.json()
    assert len(assets["ads"]) == 1
    assert assets["ads"][0]["placeholders"]
    assert assets["ads"][0]["body"]
    assert "[Tên sản phẩm]" not in assets["ads"][0]["body"]
    assert assets["script"] == ""

    pub = client.post(
        "/api/v1/pitching/decks",
        json={
            "project_name": "Trợ lý TA AI lớp L3B",
            "survey_slug": slug,
            "title": draft["title"],
            "slides": draft["slides"],
            "ads": assets["ads"],
        },
    )
    assert pub.status_code == 201
    deck_slug = pub.json()["slug"]
    assert client.get(f"/api/v1/pitching/decks/{deck_slug}").status_code == 200

    upd = client.put(
        f"/api/v1/pitching/decks/{deck_slug}",
        json={
            "project_name": "Trợ lý TA AI lớp L3B",
            "survey_slug": slug,
            "title": "Deck L3B đã sửa",
            "slides": draft["slides"][:5],
            "ads": assets["ads"],
        },
    )
    assert upd.status_code == 200
    assert upd.json()["title"] == "Deck L3B đã sửa"
    assert len(upd.json()["slides"]) == 5

    assert client.delete(f"/api/v1/pitching/decks/{deck_slug}").status_code == 204
    assert client.get(f"/api/v1/pitching/decks/{deck_slug}").status_code == 404


_UNACCENTED_AD = {
    "channel": "Bai dang chung",
    "hook": "Ban co dang mat don hang vao buoi toi chi vi khong kip tra loi tin nhan cua khach?",
    "body": (
        "Dung de viec cham tre lam ban mat di khach hang. Chiikawa la giai phap ho tro Học viên giai quyet "
        "nhanh chong van de nay trong thoi gian [Thời gian mở thử nghiệm] voi [Số lượng] suat dung thu."
    ),
    "cta": "Dang ky ngay tai [Link khảo sát / Link đăng ký dùng thử]",
    "placeholders": ["[Thời gian mở thử nghiệm]", "[Số lượng]", "[Link khảo sát / Link đăng ký dùng thử]"],
}
_ACCENTED_AD = {
    **_UNACCENTED_AD,
    "channel": "Bài đăng chung",
    "hook": "Bạn có đang mất đơn hàng vào buổi tối chỉ vì không kịp trả lời tin nhắn của khách?",
    "body": "Chiikawa giúp bạn trả lời khách kịp thời, mở thử nghiệm [Thời gian mở thử nghiệm].",
    "cta": "Đăng ký ngay tại [Link khảo sát / Link đăng ký dùng thử]",
}


def _fake_llm(monkeypatch, *ads: dict) -> list[str]:
    from app.agent import llm

    replies = iter(ads)
    prompts: list[str] = []

    def structured(schema, prompt, **_kwargs):
        prompts.append(prompt)
        return schema.model_validate({"ads": [next(replies)]})

    monkeypatch.setattr(llm, "structured", structured)
    return prompts


def test_pitch_assets_retries_when_llm_drops_diacritics(monkeypatch):
    from app.agent.pitching_gen import generate_pitch_assets
    from app.schemas import ProblemContextIn

    prompts = _fake_llm(monkeypatch, _UNACCENTED_AD, _ACCENTED_AD)
    out = generate_pitch_assets(ProblemContextIn(**_sample_context()))
    assert out.source == "llm"
    assert out.ads[0].hook == _ACCENTED_AD["hook"]
    assert len(prompts) == 2
    assert "CÓ ĐẦY ĐỦ DẤU" in prompts[1]


def test_pitch_assets_falls_back_when_llm_stays_unaccented(monkeypatch):
    from app.agent.pitching_gen import generate_pitch_assets
    from app.schemas import ProblemContextIn

    prompts = _fake_llm(monkeypatch, _UNACCENTED_AD, _UNACCENTED_AD)
    out = generate_pitch_assets(ProblemContextIn(**_sample_context()))
    assert out.source == "fallback"
    assert "Nhóm mình đang thử nghiệm" in out.ads[0].body
    assert len(prompts) == 2


# ---------- Guardrail số liệu của agent Pitching (slide, overview, quảng cáo) ----------

from app.agent import llm, pitching_gen  # noqa: E402
from app.schemas import (  # noqa: E402
    PitchAdPost,
    PitchSlide,
    ProblemContextIn,
    SurveyOptionStat,
    SurveyQuestionStat,
    SurveyStatsOut,
)


def _ctx() -> ProblemContextIn:
    return ProblemContextIn(
        project_name="Trợ lý trả lời khách shop online",
        target_role="Chủ shop",
        persona="Chị Lan, chủ shop quần áo ở Đà Nẵng",
        problem="Tuần trước mất 3 đơn vì trả lời khách trễ lúc tối",
        leverage="AI hiểu câu hỏi tự do về giá và size",
        scope="Chỉ trả lời giá và size trên Zalo",
        metric="Không mất quá 1 đơn mỗi tuần",
    )


def _stats(sample: int = 8) -> SurveyStatsOut:
    def opt(label: str, count: int, answered: int = 22) -> SurveyOptionStat:
        return SurveyOptionStat(label=label, count=count, pct=round(count / answered * 100, 1))

    return SurveyStatsOut(
        survey_id="s",
        slug="demo",
        title="Khảo sát",
        total_responses=22,
        real_responses=22 - sample,
        sample_responses=sample,
        questions=[
            SurveyQuestionStat(
                id="q0",
                type="choice",
                q="Quên trả lời khách mấy lần?",
                answered=22,
                options=[opt("1–2 lần", 7), opt("3–5 lần", 9), opt("Gần như mỗi ngày", 6)],
            ),
            SurveyQuestionStat(
                id="q1",
                type="multi",
                q="Đang xử lý thế nào?",
                answered=22,
                options=[opt("Trả lời tay", 7), opt("Nhờ người nhà", 12)],
            ),
            SurveyQuestionStat(id="q2", type="scale", q="Bất tiện?", answered=22, avg=3.9, options=[]),
            SurveyQuestionStat(id="q3", type="text", q="Góp ý?", answered=1, texts=["Sợ bot báo sai giá"]),
        ],
    )


def test_survey_facts_are_computed_by_code():
    facts = pitching_gen._survey_facts(_stats())
    assert facts[0] == "Quy mô: 22 phản hồi (14 thật, 8 mẫu)"
    assert any('"3–5 lần" 9/22 (40.9%)' in f for f in facts)
    assert any("điểm trung bình 3.9/5" in f for f in facts)
    assert any("lời người thật" in f and "Sợ bot báo sai giá" in f for f in facts)
    assert pitching_gen._survey_facts(None) == []


def test_clean_slides_guardrails():
    raw = [
        PitchSlide(title="Mở đầu", body="- A: x\n- B: y", layout="split"),
        PitchSlide(
            kicker="Vấn đề",
            title="86.4% chủ shop quên trả lời",
            body="- Thật: 9/22 quên 3–5 lần\n- Bịa: 73% bỏ đơn",
            highlight="86.4% từng quên",
            layout="split",
        ),
        PitchSlide(kicker="MVP", title="Gọn", body="- Trong MVP: a\n- Chưa làm: b\n- Mục tiêu: c", layout="compare"),
        PitchSlide(
            kicker="Bằng chứng", title="Tín hiệu khảo sát", body="- Điểm 3.9/5", highlight="Cao", layout="metric"
        ),
        PitchSlide(kicker="Đo lường", title="Chỉ số", body="- Giảm 50% bỏ đơn\n- Tỉ lệ đúng giờ", layout="metric"),
        PitchSlide(
            kicker="Bước tiếp theo",
            title="Kế hoạch",
            body="- Bước 1: làm\n- Bước 2: mời 30 người\n- Bước 3: đo",
            layout="steps",
        ),
    ]
    out = pitching_gen._clean_slides(raw, 10, _ctx(), _stats())

    assert out[0].layout == "hero"
    assert "9/22" in out[1].body and "73%" not in out[1].body
    assert out[1].highlight == "" and "[?]" in out[1].title
    assert out[2].layout == "cards"  # compare phải đúng 2 vế
    assert out[3].highlight == "22 phản hồi · 14 thật"  # metric không có số → lấy quy mô khảo sát
    assert "mẫu" in out[3].body  # có phản hồi mẫu thì slide bằng chứng phải ghi rõ
    assert out[4].layout == "split" and "50%" not in out[4].body
    assert out[5].body.splitlines() == ["- Bước 1: làm", "- Bước 2: đo"]  # đánh số lại sau khi bỏ bước


def test_metric_bare_number_gets_label_only_when_unique():
    stats = _stats()
    slides = [
        PitchSlide(title="Mở", body="- a\n- b\n- c", layout="hero"),
        PitchSlide(kicker="Bằng chứng", title="Tín hiệu", body="- x", highlight="9/22", layout="metric"),
        PitchSlide(kicker="Bằng chứng", title="Tín hiệu", body="- x", highlight="7/22", layout="metric"),
    ]
    out = pitching_gen._clean_slides(slides, 10, _ctx(), stats)
    assert out[1].highlight == '9/22 chọn "3–5 lần"'
    assert out[2].highlight == "7/22"  # hai phương án cùng 7/22 → không đoán


def test_fallback_deck_uses_facts_and_discloses_samples():
    deck = pitching_gen._rule_based_deck(_ctx(), _stats(), 7)
    evidence = next(s for s in deck.slides if s.kicker == "Bằng chứng")
    assert evidence.layout == "metric"
    assert "14 thật, 8 mẫu" in evidence.body
    no_stats = pitching_gen._rule_based_deck(_ctx(), None, 7)
    assert all("22" not in s.body for s in no_stats.slides)


def test_overview_and_ads_drop_fabricated_numbers(monkeypatch):
    def fake_structured(schema, prompt, node=""):
        assert "Quy mô: 22 phản hồi" in prompt  # prompt nhận số tính sẵn, không phải JSON thô
        if schema is pitching_gen._GeneratedOverview:
            return schema(
                overview="Có 22 phản hồi, 8 là mẫu. 9/22 quên 3–5 lần.\n100% chủ shop muốn dùng ngay. Cần thêm phỏng vấn."
            )
        return schema(
            ads=[
                PitchAdPost(
                    hook="Chủ shop mất đơn vì trả lời trễ?",
                    body="Đã giúp 500 shop tăng 30% đơn. Bản đầu chỉ trả lời giá và size.",
                    cta="Đăng ký tại [Link]",
                    placeholders=["[Link]"],
                )
            ]
        )

    monkeypatch.setattr(llm, "structured", fake_structured)
    ov = pitching_gen.generate_pitch_overview(_ctx(), _stats())
    assert ov.source == "llm"
    assert "9/22" in ov.overview and "100%" not in ov.overview and "Cần thêm phỏng vấn." in ov.overview

    ads = pitching_gen.generate_pitch_assets(_ctx(), _stats())
    body = ads.ads[0].body
    assert "500" not in body and "30%" not in body and "giá và size" in body


def test_agent_ignores_sample_free_text(client, monkeypatch):
    slug = client.post(
        "/api/v1/pitching/surveys",
        json={
            "project_name": "Shop chị Lan",
            "target_role": "Chủ shop",
            "title": "Khảo sát shop",
            "questions": [
                {"id": "q0", "type": "choice", "q": "Tần suất?", "options": ["Ít", "Nhiều"], "required": True},
                {"id": "q1", "type": "text", "q": "Góp ý?", "options": [], "required": True},
            ],
        },
    ).json()["slug"]
    client.post(
        f"/api/v1/pitching/surveys/{slug}/responses", json={"answers": {"q0": "Nhiều", "q1": "Sợ bot báo sai giá"}}
    )
    client.post(f"/api/v1/pitching/surveys/{slug}/samples")

    # Dashboard vẫn hiện đủ câu trả lời (thật + mẫu)
    texts = client.get(f"/api/v1/pitching/surveys/{slug}/stats").json()["questions"][1]["texts"]
    assert len(texts) == 9

    prompts: list[str] = []

    def capture(schema, prompt, node=""):
        prompts.append(prompt)
        raise llm.LLMUnavailableError("test")

    monkeypatch.setattr(llm, "structured", capture)
    res = client.post("/api/v1/pitching/overview", json={"context": _sample_context("Chủ shop"), "survey_slug": slug})
    assert res.status_code == 200
    assert "Sợ bot báo sai giá" in prompts[0]
    assert "Cần có trích dẫn rõ nguồn" not in prompts[0]  # câu tự luận của phản hồi mẫu

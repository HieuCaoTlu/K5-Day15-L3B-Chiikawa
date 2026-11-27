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
    assert len(student_body["questions"]) == 5
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
            "questions": draft["questions"],
        },
    )
    assert pub_res.status_code == 201
    survey = pub_res.json()
    slug = survey["slug"]
    assert survey["target_role"] == "Học viên"
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

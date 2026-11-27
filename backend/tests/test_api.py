"""Unit test API — mẫu để copy khi làm tính năng mới."""


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["db"] == "ok"
    assert body["llm"] == "mock"


def test_items_seeded_and_create(client):
    seeded = client.get("/api/v1/items").json()
    assert len(seeded) >= 1

    res = client.post("/api/v1/items", json={"title": "Viết test", "status": "doing"})
    assert res.status_code == 201
    item = res.json()
    assert client.get(f"/api/v1/items/{item['id']}").json()["title"] == "Viết test"


def test_items_validation(client):
    assert client.post("/api/v1/items", json={"title": ""}).status_code == 422
    assert client.post("/api/v1/items", json={"title": "x", "status": "sai"}).status_code == 422
    assert client.get("/api/v1/items/999999").status_code == 404

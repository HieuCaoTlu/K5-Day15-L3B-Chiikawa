"""Xóa cấu hình GitHub đã lưu để kết nối lại: python -m app.planning.reset_github"""

from app.db import init_db
from app.planning import github_app

if __name__ == "__main__":
    init_db()
    github_app.clear()
    print("Đã xóa cấu hình GitHub đã lưu. Xóa app cũ trên GitHub rồi bấm Kết nối GitHub trong Planning.")

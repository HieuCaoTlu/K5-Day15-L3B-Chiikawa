/* Dữ liệu Workstation lưu trên trình duyệt thuộc về tài khoản đang đăng nhập: đăng xuất thì phải xoá. */
(function () {
  // Mọi khoá của Workstation: tang-v4, bản dự phòng, bản cũ tang-demo-* (còn thì app đọc lại) và mã mời.
  const owned = key => /^tang[-.]/.test(key);
  function wipe(storage) {
    Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter(owned).forEach(key => storage.removeItem(key));
  }
  /* Dữ liệu trên máy gắn với một tài khoản GitHub (local.owner). Server cho biết người đang đăng nhập không phải
     chủ đó (đã đăng xuất, hết phiên hoặc đổi tài khoản) thì dữ liệu phải bỏ. Bản nháp trước khi đăng nhập chưa có chủ
     nên được giữ. Bản lưu cũ chưa ghi chủ: đã đồng bộ với đội mà nay không đăng nhập thì cũng bỏ. */
  function stale(state, local) {
    if (!state) return false; // chưa đọc được server thì chưa kết luận
    const id = state.profile ? state.profile.github_id : '';
    if (local.owner) return id !== local.owner;
    return !id && Object.keys(local.shared || {}).length > 0;
  }

  window.SESSION = { wipe, stale };
})();

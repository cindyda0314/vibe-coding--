// 공통 UI 헬퍼: 네비게이션, 이스케이프, 숫자 파싱/포맷.
window.GC = window.GC || {};

GC.ui = (function () {
  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; });
  }

  // 빈 값/NaN은 null (0과 구분)
  function parseNumber(text) {
    if (text == null) return null;
    const trimmed = String(text).trim();
    if (trimmed === '') return null;
    const n = Number(trimmed);
    return Number.isNaN(n) || !Number.isFinite(n) ? null : n;
  }

  function formatNumber(n, digits) {
    if (n == null || Number.isNaN(n)) return '-';
    const d = digits == null ? 1 : digits;
    return String(Number(n.toFixed(d)));
  }

  // <body data-page="..."> 값과 같은 nav 링크를 현재 페이지로 표시
  function initNav() {
    const current = document.body.getAttribute('data-page');
    document.querySelectorAll('.site-nav a').forEach(function (a) {
      if (a.getAttribute('data-page') === current) a.setAttribute('aria-current', 'page');
    });
  }

  return { esc: esc, parseNumber: parseNumber, formatNumber: formatNumber, initNav: initNav };
})();

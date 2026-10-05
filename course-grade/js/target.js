// 성적 입력·현재 성적 요약 페이지 진입 스크립트
(function () {
  const ui = GC.ui;
  const calc = GC.calc;
  const storage = GC.storage;

  let course = null; // 현재 과목 (입력 중 메모리 상태, 변경 시 저장)

  function $(id) { return document.getElementById(id); }

  // ---------- 저장 ----------
  function persist(patch) {
    storage.updateCourseGrades(course.id, patch);
    showStatus();
  }

  function showStatus() {
    const el = $('status');
    el.hidden = storage.isPersisted();
    if (!el.hidden) el.textContent = '⚠ 저장 공간을 사용할 수 없어 이 탭에서만 유지됩니다.';
  }

  // ---------- 입력 검증 ----------
  // 반환: { ok, value, message }. 빈 값은 허용 여부를 optional로 구분한다.
  function parseField(field, raw, item) {
    const text = raw.trim();
    if (field === 'name') return text ? { ok: true, value: text } : { ok: false, message: '항목명을 입력하세요.' };

    const optional = field === 'score' || field === 'rank';
    if (text === '') return optional ? { ok: true, value: null } : { ok: false, message: '값을 입력하세요.' };

    const n = ui.parseNumber(text);
    if (n == null) return { ok: false, message: '숫자로 입력하세요.' };
    return validateNumber(field, n, item);
  }

  function validateNumber(field, n, item) {
    if (field === 'weight' && (n < 0 || n > 100)) return { ok: false, message: '반영 비율은 0~100 사이여야 합니다.' };
    if (field === 'max') {
      if (n <= 0) return { ok: false, message: '만점은 0보다 커야 합니다.' };
      if (calc.isEntered(item.score) && item.score > n) return { ok: false, message: '만점은 입력한 내 점수보다 작을 수 없습니다.' };
    }
    if (field === 'score' && (n < 0 || n > item.max)) return { ok: false, message: '내 점수는 0~만점(' + item.max + ') 사이여야 합니다.' };
    if (field === 'rank') return validateRank(n);
    return { ok: true, value: n };
  }

  function validateRank(n) {
    if (!Number.isInteger(n) || n < 1) return { ok: false, message: '순위는 1 이상의 정수여야 합니다.' };
    if (calc.isEntered(course.enrollment) && n > course.enrollment) {
      return { ok: false, message: '순위는 전체 수강 인원(' + course.enrollment + '명) 이하여야 합니다.' };
    }
    return { ok: true, value: n };
  }

  const FIELD_LABELS = { name: '항목명', weight: '반영 비율', max: '만점', score: '내 점수', rank: '내 순위' };

  function setItemError(message) {
    $('item-error').textContent = message || '';
  }

  // ---------- 평가 항목 표 ----------
  function numberCell(item, index, field) {
    const v = item[field] == null ? '' : item[field];
    return '<td data-label="' + FIELD_LABELS[field] + '"><input type="text" inputmode="decimal" ' +
      'data-field="' + field + '" value="' + ui.esc(v) + '" aria-label="' + (index + 1) + '번 항목 ' +
      FIELD_LABELS[field] + '"></td>';
  }

  function itemRowHtml(item, index) {
    const id = ui.esc(item.id);
    return '<tr data-id="' + id + '">' +
      '<td data-label="항목명"><input type="text" data-field="name" value="' + ui.esc(item.name) +
      '" aria-label="' + (index + 1) + '번 항목 이름"></td>' +
      numberCell(item, index, 'weight') +
      numberCell(item, index, 'max') +
      numberCell(item, index, 'score') +
      numberCell(item, index, 'rank') +
      '<td data-label="환산 점수" class="converted" data-role="converted"></td>' +
      '<td data-label="삭제"><button type="button" class="btn-danger" data-action="delete" aria-label="' +
      (index + 1) + '번 항목 삭제">삭제</button></td>' +
      '</tr>';
  }

  // 구조가 바뀔 때(추가/삭제)만 행을 다시 그린다. 타이핑 중에는 포커스를 지키기 위해 쓰지 않는다.
  function renderItems() {
    $('items-body').innerHTML = course.items.map(itemRowHtml).join('');
    renderDerived();
  }

  function convertedText(item) {
    const c = calc.convertedScore(item);
    return c == null ? '미입력' : ui.formatNumber(c, 2) + '점';
  }

  // ---------- 요약 (입력 시마다 갱신) ----------
  function renderConverted() {
    document.querySelectorAll('#items-body tr').forEach(function (tr) {
      const item = findItem(tr.getAttribute('data-id'));
      if (item) tr.querySelector('[data-role="converted"]').textContent = convertedText(item);
    });
  }

  function renderWeight() {
    const sum = calc.weightSum(course.items);
    const valid = calc.isWeightValid(course.items);
    $('weight-sum').textContent = '반영 비율 합계: ' + ui.formatNumber(sum, 2) + '% ' + (valid ? '✔' : '(100%가 아님)');
    const warn = $('weight-warning');
    warn.hidden = valid;
    if (!valid) warn.textContent = '⚠ 반영 비율 합계가 100%가 아닙니다. 현재 ' +
      ui.formatNumber(sum, 2) + '%이며, 총 환산 점수는 100점 만점 기준이 아닐 수 있습니다.';
  }

  function renderSummary() {
    $('sum-score').textContent = ui.formatNumber(calc.totalScore(course.items), 2) + ' / 100점';
    const rate = calc.inputRate(course.items);
    $('sum-rate').textContent = Math.round(rate * 100) + '%';
  }

  function renderDerived() {
    renderConverted();
    renderWeight();
    renderSummary();
  }

  function findItem(id) {
    return course.items.find(function (it) { return it.id === id; }) || null;
  }

  // ---------- 항목 이벤트 ----------
  function handleItemInput(e) {
    const input = e.target.closest('input[data-field]');
    if (!input) return;
    const item = findItem(input.closest('tr').getAttribute('data-id'));
    const field = input.getAttribute('data-field');
    const parsed = parseField(field, input.value, item);
    input.setAttribute('aria-invalid', parsed.ok ? 'false' : 'true');
    if (!parsed.ok) {
      setItemError(FIELD_LABELS[field] + ': ' + parsed.message);
      return; // 잘못된 값은 저장하지 않는다
    }
    setItemError('');
    item[field] = parsed.value;
    persist({ items: course.items });
    renderDerived();
  }

  function handleItemClick(e) {
    const btn = e.target.closest('button[data-action="delete"]');
    if (!btn) return;
    deleteItem(btn.closest('tr').getAttribute('data-id'));
  }

  function deleteItem(id) {
    const item = findItem(id);
    if (!item || !window.confirm('"' + item.name + '" 항목을 삭제할까요?')) return;
    course.items = course.items.filter(function (it) { return it.id !== id; });
    persist({ items: course.items });
    setItemError('');
    renderItems();
  }

  function addItem() {
    const item = { id: storage.newId('i_'), name: '새 항목', weight: 0, max: 100, score: null, rank: null, isFinal: false };
    course.items.push(item);
    persist({ items: course.items });
    setItemError('');
    renderItems();
    const rows = document.querySelectorAll('#items-body tr');
    rows[rows.length - 1].querySelector('input[data-field="name"]').select();
  }

  const BASIS_NAMES = { general: '일반수업', english: '영어A', davinci: '다빈치러닝' };

  function renderRatioInfo() {
    const rule = calc.gradeRatioRule(course.gradingBasis);
    $('ratio-info').textContent = (BASIS_NAMES[course.gradingBasis] || BASIS_NAMES.general) + ': A 최대 ' +
      rule.aMax + '%, B까지 최대 ' + rule.bMax + '% (나머지는 C 이하)';
  }

  function handleBasisChange() {
    course.gradingBasis = $('basis-select').value;
    persist({ gradingBasis: course.gradingBasis });
    renderRatioInfo();
  }

  // ---------- 초기화 ----------
  function renderCourseHeader() {
    $('course-title').textContent = course.name + ' — 성적 입력';
    const credits = course.credits != null ? course.credits + '학점' : '학점 미입력';
    const enrollment = course.enrollment != null ? '수강 ' + course.enrollment + '명' : '수강 인원 미입력';
    $('course-meta').textContent = credits + ' · ' + enrollment;
  }

  function render() {
    renderCourseHeader();
    $('basis-select').value = course.gradingBasis;
    renderRatioInfo();
    renderItems();
  }

  document.addEventListener('DOMContentLoaded', function () {
    ui.initNav();
    course = storage.getCurrentCourse();
    $('empty').hidden = !!course;
    $('content').hidden = !course;
    showStatus();
    if (!course) return;

    $('items-body').addEventListener('input', handleItemInput);
    $('items-body').addEventListener('click', handleItemClick);
    $('item-add').addEventListener('click', addItem);
    $('basis-select').addEventListener('change', handleBasisChange);
    render();
  });
})();

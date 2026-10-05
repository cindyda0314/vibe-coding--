// 학기·과목 관리 페이지 진입 스크립트
(function () {
  const ui = GC.ui;
  const storage = GC.storage;

  let editingId = null; // 폼이 수정 중인 과목 id (null이면 추가 모드)

  function $(id) { return document.getElementById(id); }

  function setError(id, message) {
    $(id).textContent = message || '';
  }

  function clearErrors() {
    ['semester-error', 'course-name-error', 'course-credits-error', 'course-enrollment-error']
      .forEach(function (id) { setError(id, ''); });
  }

  function getCurrentSemester(state) {
    return state.semesters.find(function (s) { return s.id === state.currentSemesterId; }) || null;
  }

  function showStatus() {
    const el = $('status');
    el.hidden = storage.isPersisted();
    if (!el.hidden) el.textContent = '⚠ 저장 공간을 사용할 수 없어 이 탭에서만 유지됩니다.';
  }

  function renderSemesters(state) {
    const select = $('semester-select');
    if (!state.semesters.length) {
      select.innerHTML = '<option value="">학기 없음</option>';
    } else {
      select.innerHTML = state.semesters.map(function (s) {
        const selected = s.id === state.currentSemesterId ? ' selected' : '';
        return '<option value="' + ui.esc(s.id) + '"' + selected + '>' + ui.esc(s.name) + '</option>';
      }).join('');
    }
    select.disabled = !state.semesters.length;
    $('semester-delete').disabled = !state.semesters.length;
  }

  // 현재 연도 기준 -5년 ~ +2년, 기본 선택은 올해 1학기
  function initSemesterPicker() {
    const thisYear = new Date().getFullYear();
    let years = '';
    for (let y = thisYear - 5; y <= thisYear + 2; y++) {
      years += '<option value="' + y + '"' + (y === thisYear ? ' selected' : '') + '>' + y + '년</option>';
    }
    $('semester-year').innerHTML = years;
    $('semester-term').innerHTML = storage.TERMS.map(function (t) {
      return '<option value="' + ui.esc(t) + '">' + ui.esc(t) + '</option>';
    }).join('');
  }

  function fillForm(course) {
    $('course-name').value = course ? course.name : '';
    $('course-credits').value = course && course.credits != null ? course.credits : '';
    $('course-enrollment').value = course && course.enrollment != null ? course.enrollment : '';
  }

  function renderForm(state) {
    const sem = getCurrentSemester(state);
    const editing = sem && editingId ? sem.courses.find(function (c) { return c.id === editingId; }) : null;
    if (!editing) editingId = null;
    $('course-fieldset').disabled = !sem;
    $('course-form-hint').hidden = !!sem;
    $('course-form-title').textContent = editingId ? '과목 수정' : '과목 추가';
    $('course-submit').textContent = editingId ? '저장' : '추가';
    $('course-new').hidden = !editingId;
    fillForm(editing);
  }

  function courseRowHtml(course, isCurrent) {
    const credits = course.credits != null ? course.credits + '학점' : '학점 미입력';
    const enrollment = course.enrollment != null ? course.enrollment + '명' : '인원 미입력';
    const badge = isCurrent ? ' <span class="badge">선택됨</span>' : '';
    const id = ui.esc(course.id);
    return '<li class="course-item' + (isCurrent ? ' is-current' : '') + '">' +
      '<div class="course-info"><strong>' + ui.esc(course.name) + '</strong>' + badge +
      '<div class="hint">' + credits + ' · ' + enrollment + '</div></div>' +
      '<div class="row">' +
      '<button type="button" data-action="select" data-id="' + id + '">선택</button>' +
      '<button type="button" class="btn-danger" data-action="delete" data-id="' + id + '">삭제</button>' +
      '</div></li>';
  }

  function renderCourseList(state) {
    const sem = getCurrentSemester(state);
    const list = $('course-list');
    if (!sem) {
      list.innerHTML = '<li class="hint">학기를 먼저 추가하세요.</li>';
    } else if (!sem.courses.length) {
      list.innerHTML = '<li class="hint">이 학기에 등록된 과목이 없습니다.</li>';
    } else {
      list.innerHTML = sem.courses.map(function (c) {
        return courseRowHtml(c, c.id === state.currentCourseId);
      }).join('');
    }
    $('goto-target').hidden = !state.currentCourseId;
  }

  function render() {
    const state = storage.load();
    renderSemesters(state);
    renderForm(state);
    renderCourseList(state);
    showStatus();
  }

  // 반환: { ok, value, message } — 빈 값은 value null
  function parseOptional(raw, validate) {
    const text = raw.trim();
    if (text === '') return { ok: true, value: null };
    const n = ui.parseNumber(text);
    if (n == null) return { ok: false, message: '숫자로 입력하세요.' };
    const message = validate(n);
    return message ? { ok: false, message: message } : { ok: true, value: n };
  }

  function validateCredits(n) {
    if (n <= 0) return '학점은 0보다 커야 합니다.';
    if (Math.abs(n * 2 - Math.round(n * 2)) > 1e-9) return '학점은 0.5 단위로 입력하세요.';
    return '';
  }

  function validateEnrollment(n) {
    return Number.isInteger(n) && n >= 1 ? '' : '수강 인원은 1 이상의 정수여야 합니다.';
  }

  function readCourseForm() {
    clearErrors();
    const name = $('course-name').value.trim();
    const credits = parseOptional($('course-credits').value, validateCredits);
    const enrollment = parseOptional($('course-enrollment').value, validateEnrollment);
    if (!name) setError('course-name-error', '과목명을 입력하세요.');
    if (!credits.ok) setError('course-credits-error', credits.message);
    if (!enrollment.ok) setError('course-enrollment-error', enrollment.message);
    if (!name || !credits.ok || !enrollment.ok) return null;
    return { name: name, credits: credits.value, enrollment: enrollment.value };
  }

  function handleCourseSubmit(e) {
    e.preventDefault();
    const meta = readCourseForm();
    if (!meta) return;
    if (editingId) {
      storage.updateCourseMeta(editingId, meta);
    } else {
      const state = storage.load();
      if (!state.currentSemesterId) return;
      storage.addCourse(state.currentSemesterId, meta);
    }
    editingId = null;
    render();
    $('course-name').focus();
  }

  function handleSemesterSubmit(e) {
    e.preventDefault();
    clearErrors();
    if (!storage.addSemester($('semester-year').value, $('semester-term').value)) {
      setError('semester-error', '연도와 학기를 선택하세요.');
      return;
    }
    editingId = null;
    render();
  }

  function handleSemesterChange() {
    const id = $('semester-select').value;
    if (!id) return;
    storage.setCurrent(id, null);
    editingId = null;
    clearErrors();
    render();
  }

  function handleSemesterDelete() {
    const state = storage.load();
    const sem = getCurrentSemester(state);
    if (!sem) return;
    const msg = '"' + sem.name + '" 학기를 삭제할까요?' +
      (sem.courses.length ? '\n과목 ' + sem.courses.length + '개도 함께 삭제됩니다.' : '');
    if (!window.confirm(msg)) return;
    storage.deleteSemester(sem.id);
    editingId = null;
    render();
  }

  function selectCourse(id) {
    const state = storage.load();
    storage.setCurrent(state.currentSemesterId, id);
    editingId = id;
    clearErrors();
    render();
  }

  function deleteCourse(id) {
    const state = storage.load();
    const sem = getCurrentSemester(state);
    const course = sem && sem.courses.find(function (c) { return c.id === id; });
    if (!course) return;
    if (!window.confirm('"' + course.name + '" 과목을 삭제할까요?')) return;
    storage.deleteCourse(id);
    if (editingId === id) editingId = null;
    render();
  }

  function handleListClick(e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    if (btn.getAttribute('data-action') === 'select') selectCourse(btn.getAttribute('data-id'));
    else deleteCourse(btn.getAttribute('data-id'));
  }

  function handleNewCourse() {
    editingId = null;
    clearErrors();
    render();
    $('course-name').focus();
  }

  document.addEventListener('DOMContentLoaded', function () {
    ui.initNav();
    initSemesterPicker();
    $('semester-form').addEventListener('submit', handleSemesterSubmit);
    $('semester-select').addEventListener('change', handleSemesterChange);
    $('semester-delete').addEventListener('click', handleSemesterDelete);
    $('course-form').addEventListener('submit', handleCourseSubmit);
    $('course-new').addEventListener('click', handleNewCourse);
    $('course-list').addEventListener('click', handleListClick);
    render();
  });
})();

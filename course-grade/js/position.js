// 상대 위치 페이지 진입 스크립트. 결과는 항상 추정치로 표기한다.
(function () {
  const ui = GC.ui;
  const calc = GC.calc;
  const storage = GC.storage;

  const BASIS_NAMES = { general: '일반수업', english: '영어A', davinci: '다빈치러닝' };
  const ZONE_NAMES = { A: 'A 권역', B: 'B 권역', C: 'C 이하 권역' };
  const ZONE_HINTS = {
    A: 'A를 받을 가능성이 있는 구간',
    B: 'B를 받을 가능성이 있는 구간',
    C: 'C 이하가 될 수 있는 구간',
  };

  function $(id) { return document.getElementById(id); }

  function pct(n) { return ui.formatNumber(n, 1) + '%'; }

  function showStatus() {
    const el = $('status');
    el.hidden = storage.isPersisted();
    if (!el.hidden) el.textContent = '⚠ 저장 공간을 사용할 수 없어 이 탭에서만 유지됩니다.';
  }

  function renderHeader(course) {
    $('course-title').textContent = course.name + ' — 상대 위치 (추정)';
    const enrollment = calc.isEntered(course.enrollment) ? '수강 ' + course.enrollment + '명' : '수강 인원 미입력';
    $('course-meta').textContent = (BASIS_NAMES[course.gradingBasis] || BASIS_NAMES.general) + ' · ' + enrollment;
  }

  // 추정할 수 없는 이유를 구체적으로 안내한다
  function blockedMessage(course) {
    if (!calc.isEntered(course.enrollment) || !(course.enrollment > 0)) {
      return '전체 수강 인원이 입력되지 않았습니다. 입력 페이지에서 이 과목의 수강 인원을 입력하세요.';
    }
    return '순위가 입력된 평가 항목이 없습니다. 성적 입력 페이지의 표에서 항목별 내 순위를 입력하세요.';
  }

  function headlineText(position, enrollment) {
    return '상위 약 ' + pct(position.topPercent) + ' (약 ' + position.expectedRank + '등 이내, 전체 ' +
      enrollment + '명 중)로 추정';
  }

  function rangeText(position) {
    const r = position.rankRange;
    return r.from === r.to ? r.from + '등' : r.from + '등 ~ ' + r.to + '등';
  }

  function interpretText(outlook) {
    let text = '현재 ' + ZONE_HINTS[outlook.zone] + '으로 추정됩니다.';
    if (outlook.borderline) {
      text += ' 다만 항목별 위치가 ' + ZONE_NAMES[outlook.bestZone] + '부터 ' + ZONE_NAMES[outlook.worstZone] +
        '까지 걸쳐 있어 남은 평가에 따라 달라질 수 있습니다.';
    }
    return text;
  }

  function renderSummary(position, outlook, course) {
    $('result-headline').textContent = headlineText(position, course.enrollment);
    $('res-percent').textContent = '약 ' + pct(position.topPercent);
    $('res-rank').textContent = '약 ' + position.expectedRank + '등';
    $('res-range').textContent = rangeText(position);
    $('res-zone').textContent = ZONE_NAMES[outlook.zone];
    $('result-interpret').textContent = interpretText(outlook);
  }

  // ---------- 등급 권역 막대 ----------
  function segmentHtml(zone, from, to) {
    return '<div class="zone zone-' + zone.toLowerCase() + '" style="width:' + (to - from) + '%">' +
      '<span class="zone-name">' + ZONE_NAMES[zone] + '</span>' +
      '<span class="zone-range">' + ui.formatNumber(from, 0) + '~' + ui.formatNumber(to, 0) + '%</span></div>';
  }

  // 막대 양 끝에서 라벨이 잘리지 않도록 정렬 기준을 바꾼다
  function markerShift(percent) {
    if (percent < 15) return '0';
    if (percent > 85) return '-100%';
    return '-50%';
  }

  function renderBar(position, outlook, rule) {
    const min = position.percentRange.min;
    const max = position.percentRange.max;
    $('zone-bar').innerHTML =
      '<div class="zone-track">' +
        segmentHtml('A', 0, rule.aMax) + segmentHtml('B', rule.aMax, rule.bMax) + segmentHtml('C', rule.bMax, 100) +
        '<div class="zone-band" style="left:' + min + '%;width:' + Math.max(max - min, 0) + '%"></div>' +
        '<div class="zone-marker" style="left:' + position.topPercent + '%"></div>' +
      '</div>' +
      '<div class="zone-marker-label" style="left:' + position.topPercent + '%;transform:translateX(' +
        markerShift(position.topPercent) + ')">▲ 내 위치(추정) ' +
        pct(position.topPercent) + '</div>';
    $('zone-bar').setAttribute('aria-label', '상위 ' + pct(position.topPercent) + ' 지점, ' +
      ZONE_NAMES[outlook.zone] + '으로 추정. 항목별 범위는 상위 ' + pct(min) + '에서 ' + pct(max) + '.');
  }

  function renderRatioInfo(course, rule) {
    $('ratio-info').textContent = '중앙대학교 학사운영규정 상대평가 기준 (' +
      (BASIS_NAMES[course.gradingBasis] || BASIS_NAMES.general) + '): A는 상위 ' + rule.aMax +
      '%까지, A·B 합산 상위 ' + rule.bMax + '%까지, 나머지는 C 이하. 성적 기준은 성적 입력 페이지에서 바꿀 수 있습니다.';
  }

  // ---------- 항목별 표 ----------
  function rowHtml(item, enrollment, used) {
    const hasRank = calc.isEntered(item.rank);
    const rank = hasRank ? item.rank + '등 / ' + enrollment + '명' : '미입력';
    const percent = used ? pct((item.rank / enrollment) * 100) : '-';
    const state = used ? '반영 ✔' : (hasRank ? '제외 (순위가 인원 범위 밖 또는 비율 0)' : '제외 (순위 미입력)');
    return '<tr>' +
      '<td data-label="항목">' + ui.esc(item.name) + '</td>' +
      '<td data-label="반영 비율">' + ui.esc(ui.formatNumber(item.weight, 2)) + '%</td>' +
      '<td data-label="내 순위">' + ui.esc(rank) + '</td>' +
      '<td data-label="상위 비율">' + ui.esc(percent) + '</td>' +
      '<td data-label="계산 반영">' + ui.esc(state) + '</td>' +
      '</tr>';
  }

  function renderTable(course, position) {
    const excludedIds = position.excluded.map(function (it) { return it.id; });
    $('detail-body').innerHTML = course.items.map(function (item) {
      return rowHtml(item, course.enrollment, excludedIds.indexOf(item.id) === -1);
    }).join('');
  }

  function renderWeightNote(course) {
    const note = $('weight-note');
    const valid = calc.isWeightValid(course.items);
    note.hidden = valid;
    if (!valid) note.textContent = '⚠ 반영 비율 합계가 100%가 아닙니다(현재 ' +
      ui.formatNumber(calc.weightSum(course.items), 2) + '%). 추정은 입력된 비율 그대로 계산하므로 성적 입력 페이지에서 비율을 확인하세요.';
  }

  function render(course) {
    renderHeader(course);
    const position = calc.relativePosition(course.items, course.enrollment);
    const ok = position.status === 'ok';
    $('blocked').hidden = ok;
    $('result').hidden = !ok;
    if (!ok) {
      $('blocked-message').textContent = blockedMessage(course);
      return;
    }
    const rule = calc.gradeRatioRule(course.gradingBasis);
    const outlook = calc.gradeOutlook(position, rule);
    renderSummary(position, outlook, course);
    renderBar(position, outlook, rule);
    renderRatioInfo(course, rule);
    renderTable(course, position);
    renderWeightNote(course);
  }

  document.addEventListener('DOMContentLoaded', function () {
    ui.initNav();
    const course = storage.getCurrentCourse();
    $('empty').hidden = !!course;
    $('content').hidden = !course;
    showStatus();
    if (course) render(course);
  });
})();

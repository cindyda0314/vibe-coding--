// 실행: node tests/calc.test.js
const assert = require('assert');
const calc = require('../js/calc.js');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('ok - ' + name);
  } catch (e) {
    failed += 1;
    console.log('FAIL - ' + name + '\n    ' + e.message);
  }
}

function near(a, b, msg) {
  assert.ok(Math.abs(a - b) < 1e-9, (msg || '') + ' expected ' + b + ' but got ' + a);
}

// 기본 4항목. 중간 80 / 과제 90 / 출석 100 입력 시 현재 점수 = 24 + 18 + 10 = 52
function makeItems(over) {
  const items = [
    { id: 'mid', name: '중간', weight: 30, max: 100, score: 80, rank: null },
    { id: 'assignment', name: '과제', weight: 20, max: 100, score: 90, rank: null },
    { id: 'attendance', name: '출석', weight: 10, max: 100, score: 100, rank: null },
    { id: 'final', name: '기말', weight: 40, max: 100, score: null, rank: null },
  ];
  return items.map(function (it) { return Object.assign({}, it, (over && over[it.id]) || {}); });
}

test('calc module loads', function () {
  assert.ok(calc && typeof calc === 'object');
});

// ---------- 환산 점수 ----------
test('convertedScore: (score / max) * weight', function () {
  near(calc.convertedScore({ weight: 30, max: 100, score: 80 }), 24);
  near(calc.convertedScore({ weight: 20, max: 50, score: 45 }), 18);
});

test('convertedScore: 0점은 0, 미입력은 null', function () {
  assert.strictEqual(calc.convertedScore({ weight: 30, max: 100, score: 0 }), 0);
  assert.strictEqual(calc.convertedScore({ weight: 30, max: 100, score: null }), null);
});

test('convertedScore: 만점이 0 이하면 null', function () {
  assert.strictEqual(calc.convertedScore({ weight: 30, max: 0, score: 10 }), null);
});

// ---------- 반영 비율 합계 ----------
test('weightSum / isWeightValid: 기본값 합 100', function () {
  near(calc.weightSum(makeItems()), 100);
  assert.strictEqual(calc.isWeightValid(makeItems()), true);
});

test('isWeightValid: 부동소수점 오차는 허용', function () {
  const items = [{ weight: 33.3 }, { weight: 33.3 }, { weight: 33.4 }];
  assert.strictEqual(calc.isWeightValid(items), true);
  const items2 = [{ weight: 0.1 }, { weight: 0.2 }, { weight: 99.7 }];
  assert.strictEqual(calc.isWeightValid(items2), true);
});

test('isWeightValid: 100이 아니면 false', function () {
  assert.strictEqual(calc.isWeightValid(makeItems({ final: { weight: 39 } })), false);
  assert.strictEqual(calc.isWeightValid(makeItems({ final: { weight: 41 } })), false);
});

// ---------- 현재 점수 / 미입력 / 완료율 ----------
// ---------- 성적 입력 요약 ----------
test('totalScore: 입력된 모든 항목(최종 포함)의 환산 합, 미입력은 제외', function () {
  near(calc.totalScore(makeItems()), 52);
  near(calc.totalScore(makeItems({ final: { score: 50 } })), 72);
  near(calc.totalScore(makeItems({ mid: { score: null } })), 28);
  near(calc.totalScore(makeItems({ mid: { score: 0 } })), 28);
  assert.strictEqual(calc.totalScore([]), 0);
});

test('inputRate: 모든 항목 중 점수 입력 비율 (0점은 입력됨)', function () {
  near(calc.inputRate(makeItems()), 3 / 4);
  near(calc.inputRate(makeItems({ final: { score: 0 } })), 1);
  assert.strictEqual(calc.inputRate([]), 0);
});

// ---------- 상대평가 비율 ----------
test('gradeRatioRule: 기준별 상대평가 비율', function () {
  assert.deepStrictEqual(calc.gradeRatioRule('general'), { aMax: 35, bMax: 70 });
  assert.deepStrictEqual(calc.gradeRatioRule('english'), { aMax: 50, bMax: 90 });
  assert.deepStrictEqual(calc.gradeRatioRule('davinci'), { aMax: 50, bMax: 90 });
});

test('gradeRatioRule: 알 수 없는 기준은 general, 반환값은 복사본', function () {
  assert.deepStrictEqual(calc.gradeRatioRule('???'), { aMax: 35, bMax: 70 });
  calc.gradeRatioRule('general').aMax = 1;
  assert.strictEqual(calc.gradeRatioRule('general').aMax, 35);
});

// ---------- 상대 위치 ----------
test('relativePosition: 단일 항목 (60명 중 12등 → 상위 20%)', function () {
  const r = calc.relativePosition(makeItems({ mid: { rank: 12 } }), 60);
  assert.strictEqual(r.status, 'ok');
  near(r.topPercent, 20);
  assert.strictEqual(r.expectedRank, 12);
  assert.strictEqual(r.usedCount, 1);
});

test('relativePosition: 반영 비율로 가중 평균', function () {
  // mid(30%) 6등 = 10%, assignment(20%) 30등 = 50% → (30*10 + 20*50) / 50 = 26
  const r = calc.relativePosition(makeItems({ mid: { rank: 6 }, assignment: { rank: 30 } }), 60);
  near(r.topPercent, 26);
  assert.strictEqual(r.expectedRank, 16); // ceil(15.6)
  assert.strictEqual(r.usedCount, 2);
});

test('relativePosition: 범위는 항목별 최소~최대', function () {
  const r = calc.relativePosition(makeItems({ mid: { rank: 6 }, assignment: { rank: 30 } }), 60);
  near(r.percentRange.min, 10);
  near(r.percentRange.max, 50);
  assert.deepStrictEqual(r.rankRange, { from: 6, to: 30 });
});

test('relativePosition: 순위 미입력 항목은 제외하고 분모도 재정규화', function () {
  const r = calc.relativePosition(makeItems({ mid: { rank: 6 } }), 60);
  near(r.topPercent, 10); // 미입력 항목이 0%로 섞이면 안 됨
  assert.deepStrictEqual(r.excluded.map(function (e) { return e.id; }).sort(), ['assignment', 'attendance', 'final']);
});

test('relativePosition: 기말 순위도 입력되면 포함', function () {
  const r = calc.relativePosition(makeItems({ mid: { rank: 6 }, final: { rank: 30 } }), 60);
  // (30*10 + 40*50) / 70
  near(r.topPercent, (30 * 10 + 40 * 50) / 70);
});

test('relativePosition: 범위를 벗어난 순위는 제외', function () {
  const r = calc.relativePosition(makeItems({ mid: { rank: 0 }, assignment: { rank: 61 }, attendance: { rank: 6 } }), 60);
  assert.strictEqual(r.usedCount, 1);
  near(r.topPercent, 10);
});

test('relativePosition: 1등과 꼴등', function () {
  near(calc.relativePosition(makeItems({ mid: { rank: 1 } }), 60).topPercent, 100 / 60);
  near(calc.relativePosition(makeItems({ mid: { rank: 60 } }), 60).topPercent, 100);
});

test('relativePosition: 순위가 없거나 인원이 없으면 insufficient', function () {
  assert.strictEqual(calc.relativePosition(makeItems(), 60).status, 'insufficient');
  assert.strictEqual(calc.relativePosition(makeItems({ mid: { rank: 6 } }), null).status, 'insufficient');
  assert.strictEqual(calc.relativePosition(makeItems({ mid: { rank: 6 } }), 0).status, 'insufficient');
});

test('relativePosition: 항상 추정치 표시', function () {
  assert.strictEqual(calc.relativePosition(makeItems({ mid: { rank: 6 } }), 60).isEstimate, true);
  assert.strictEqual(calc.relativePosition(makeItems(), 60).isEstimate, true);
});

// ---------- 등급 권역 (A / B / C 이하) ----------
const GENERAL = { aMax: 35, bMax: 70 };

test('gradeZone: A / B / C 이하 권역', function () {
  assert.strictEqual(calc.gradeZone(10, GENERAL), 'A');
  assert.strictEqual(calc.gradeZone(50, GENERAL), 'B');
  assert.strictEqual(calc.gradeZone(90, GENERAL), 'C');
});

test('gradeZone: 경계값은 윗 등급에 포함, 초과하면 아랫 등급', function () {
  assert.strictEqual(calc.gradeZone(35, GENERAL), 'A');
  assert.strictEqual(calc.gradeZone(35.0001, GENERAL), 'B');
  assert.strictEqual(calc.gradeZone(70, GENERAL), 'B');
  assert.strictEqual(calc.gradeZone(70.0001, GENERAL), 'C');
});

test('gradeZone: 부동소수점 오차는 경계로 취급', function () {
  assert.strictEqual(calc.gradeZone(35 + 1e-12, GENERAL), 'A');
});

test('gradeZone: 기준별 비율 (영어 A 50 / B 90)', function () {
  const rule = calc.gradeRatioRule('english');
  assert.strictEqual(calc.gradeZone(45, rule), 'A');
  assert.strictEqual(calc.gradeZone(85, rule), 'B');
  assert.strictEqual(calc.gradeZone(91, rule), 'C');
});

test('gradeOutlook: 가중 평균이 속한 권역과 범위의 최선/최악 권역', function () {
  // mid 6등 = 10%, assignment 30등 = 50% → 가중 26% (A), 범위 10~50% (A~B)
  const pos = calc.relativePosition(makeItems({ mid: { rank: 6 }, assignment: { rank: 30 } }), 60);
  const o = calc.gradeOutlook(pos, GENERAL);
  assert.strictEqual(o.status, 'ok');
  assert.strictEqual(o.zone, 'A');
  assert.strictEqual(o.bestZone, 'A');
  assert.strictEqual(o.worstZone, 'B');
  assert.strictEqual(o.borderline, true);
  assert.strictEqual(o.isEstimate, true);
});

test('gradeOutlook: 범위 전체가 한 권역이면 borderline 아님', function () {
  const pos = calc.relativePosition(makeItems({ mid: { rank: 6 }, assignment: { rank: 12 } }), 60);
  const o = calc.gradeOutlook(pos, GENERAL);
  assert.strictEqual(o.zone, 'A');
  assert.strictEqual(o.borderline, false);
});

test('gradeOutlook: 같은 순위도 성적 기준에 따라 권역이 달라짐', function () {
  const pos = calc.relativePosition(makeItems({ mid: { rank: 24 } }), 60); // 상위 40%
  assert.strictEqual(calc.gradeOutlook(pos, calc.gradeRatioRule('general')).zone, 'B');
  assert.strictEqual(calc.gradeOutlook(pos, calc.gradeRatioRule('english')).zone, 'A');
});

test('gradeOutlook: 순위가 없으면 insufficient', function () {
  const o = calc.gradeOutlook(calc.relativePosition(makeItems(), 60), GENERAL);
  assert.strictEqual(o.status, 'insufficient');
  assert.strictEqual(o.isEstimate, true);
});

test('gradeOutlook: 순위 미입력 항목은 권역 판정에 섞이지 않음', function () {
  // 순위 입력은 mid(상위 10%)뿐. 미입력이 100%로 섞이면 C가 된다.
  const o = calc.gradeOutlook(calc.relativePosition(makeItems({ mid: { rank: 6 } }), 60), GENERAL);
  assert.strictEqual(o.zone, 'A');
  assert.strictEqual(o.worstZone, 'A');
});

console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exitCode = 1;

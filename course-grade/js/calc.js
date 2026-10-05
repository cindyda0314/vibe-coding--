// 순수 계산 함수만 둔다. DOM, localStorage, Date 접근 금지.
// 브라우저와 Node 모두에서 GC 네임스페이스를 얻기 위한 루트 객체
const gcRoot = typeof window !== 'undefined' ? window : globalThis;
gcRoot.GC = gcRoot.GC || {};

const EPS = 1e-9;
const GRADES = ['A', 'B', 'C', 'D', 'F'];

// TODO: 중앙대학교 공식 커트라인 확인 후 교체. 현재는 모두 예시값이다.
const DEFAULT_CUTOFFS = {
  general: { A: 90, B: 80, C: 70, D: 60, F: 0 },
  english: { A: 90, B: 80, C: 70, D: 60, F: 0 }, // TODO: 영어 기준
  davinci: { A: 90, B: 80, C: 70, D: 60, F: 0 }, // TODO: 다빈치러닝 기준
};

// 상대평가 부여 비율: 중앙대학교 학사운영규정 상대평가 기준.
// A는 상위 aMax%까지, B는 A와 합산해 상위 bMax%까지, 나머지는 C 이하.
const RATIO_RULES = {
  general: { aMax: 35, bMax: 70 },
  english: { aMax: 50, bMax: 90 },
  davinci: { aMax: 50, bMax: 90 },
};

// null(미입력)과 0(0점)을 구분하기 위한 판정
function isEntered(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// ---------- 환산 점수 ----------
function convertedScore(item) {
  if (!isEntered(item.score) || !(item.max > 0)) return null;
  return (item.score / item.max) * item.weight;
}

function weightSum(items) {
  return items.reduce(function (sum, it) { return sum + it.weight; }, 0);
}

function isWeightValid(items) {
  return Math.abs(weightSum(items) - 100) < EPS;
}

function nonFinalItems(items) {
  return items.filter(function (it) { return !it.isFinal; });
}

function currentScore(items) {
  return nonFinalItems(items).reduce(function (sum, it) {
    const c = convertedScore(it);
    return c === null ? sum : sum + c;
  }, 0);
}

function missingItems(items) {
  return nonFinalItems(items).filter(function (it) { return !isEntered(it.score); });
}

// 최종 항목을 제외하고 센다 (필요 점수 계산의 선행 조건이므로)
function completionRate(items) {
  const targets = nonFinalItems(items);
  if (targets.length === 0) return 0;
  return (targets.length - missingItems(items).length) / targets.length;
}

// 성적 입력 페이지용: 최종 항목을 구분하지 않고 입력된 모든 항목을 센다
function totalScore(items) {
  return items.reduce(function (sum, it) {
    const c = convertedScore(it);
    return c === null ? sum : sum + c;
  }, 0);
}

function inputRate(items) {
  if (items.length === 0) return 0;
  const entered = items.filter(function (it) { return isEntered(it.score); }).length;
  return entered / items.length;
}

// ---------- 필요 최종 점수 ----------
function blocked(reason, extra) {
  return Object.assign({ status: 'blocked', reason: reason, needed: null, neededCeil: null, missing: [] }, extra);
}

function classifyNeeded(needed, finalMax) {
  if (needed <= EPS) return { status: 'achieved', needed: needed, neededCeil: null };
  if (needed > finalMax + EPS) return { status: 'impossible', needed: needed, neededCeil: null };
  // 올림 전에 EPS를 빼서 70.00000000000001 같은 값이 71이 되지 않게 한다
  return { status: 'achievable', needed: needed, neededCeil: Math.ceil(needed - EPS) };
}

function requiredFinalScore(items, cutoff) {
  if (!isWeightValid(items)) return blocked('weight');
  const fin = items.find(function (it) { return it.isFinal; });
  if (!fin || !(fin.weight > 0) || !(fin.max > 0)) return blocked('no-final');
  const missing = missingItems(items);
  if (missing.length > 0) return blocked('missing', { missing: missing });

  // 곱셈을 먼저 해서 나눗셈 오차를 줄인다
  const needed = ((cutoff - currentScore(items)) * fin.max) / fin.weight;
  return Object.assign({ reason: null, missing: [] }, classifyNeeded(needed, fin.max));
}

function requiredScoreTable(items, cutoffs) {
  return GRADES.map(function (grade) {
    return { grade: grade, cutoff: cutoffs[grade], result: requiredFinalScore(items, cutoffs[grade]) };
  });
}

function defaultCutoffs(basis) {
  return Object.assign({}, DEFAULT_CUTOFFS[basis] || DEFAULT_CUTOFFS.general);
}

function gradeRatioRule(basis) {
  return Object.assign({}, RATIO_RULES[basis] || RATIO_RULES.general);
}

// ---------- 상대 위치 (항상 추정치) ----------
function isValidRank(rank, enrollment) {
  return isEntered(rank) && Number.isInteger(rank) && rank >= 1 && rank <= enrollment;
}

function insufficient(excluded) {
  return { status: 'insufficient', isEstimate: true, usedCount: 0, excluded: excluded };
}

function rankFromPercent(percent, enrollment) {
  return Math.ceil((percent * enrollment) / 100 - EPS);
}

function relativePosition(items, enrollment) {
  if (!isEntered(enrollment) || !(enrollment > 0)) return insufficient(items.slice());

  const used = [];
  const excluded = [];
  items.forEach(function (it) {
    if (isValidRank(it.rank, enrollment) && it.weight > 0) used.push(it);
    else excluded.push(it);
  });
  if (used.length === 0) return insufficient(excluded);

  const percents = used.map(function (it) { return (it.rank / enrollment) * 100; });
  // 순위가 있는 항목의 비율 합으로 나눠야 미입력 항목이 0%로 섞이지 않는다
  const usedWeight = used.reduce(function (s, it) { return s + it.weight; }, 0);
  const topPercent = used.reduce(function (s, it, i) { return s + it.weight * percents[i]; }, 0) / usedWeight;
  const min = Math.min.apply(null, percents);
  const max = Math.max.apply(null, percents);

  return {
    status: 'ok',
    isEstimate: true,
    topPercent: topPercent,
    expectedRank: rankFromPercent(topPercent, enrollment),
    percentRange: { min: min, max: max },
    rankRange: { from: rankFromPercent(min, enrollment), to: rankFromPercent(max, enrollment) },
    usedCount: used.length,
    excluded: excluded,
  };
}

// 경계값은 윗 등급에 포함한다 (상위 35.0%는 A).
function gradeZone(topPercent, rule) {
  if (topPercent <= rule.aMax + EPS) return 'A';
  if (topPercent <= rule.bMax + EPS) return 'B';
  return 'C';
}

// 가중 평균 위치의 권역과, 항목별 최선/최악 위치의 권역을 함께 돌려준다.
// 두 권역이 다르면 항목 간 편차 때문에 판정이 갈리는 경우라 borderline으로 표시한다.
function gradeOutlook(position, rule) {
  if (position.status !== 'ok') return { status: 'insufficient', isEstimate: true };
  const bestZone = gradeZone(position.percentRange.min, rule);
  const worstZone = gradeZone(position.percentRange.max, rule);
  return {
    status: 'ok',
    isEstimate: true,
    zone: gradeZone(position.topPercent, rule),
    bestZone: bestZone,
    worstZone: worstZone,
    borderline: bestZone !== worstZone,
  };
}

gcRoot.GC.calc = {
  EPS: EPS,
  GRADES: GRADES,
  isEntered: isEntered,
  convertedScore: convertedScore,
  weightSum: weightSum,
  isWeightValid: isWeightValid,
  currentScore: currentScore,
  totalScore: totalScore,
  inputRate: inputRate,
  missingItems: missingItems,
  completionRate: completionRate,
  requiredFinalScore: requiredFinalScore,
  requiredScoreTable: requiredScoreTable,
  defaultCutoffs: defaultCutoffs,
  gradeRatioRule: gradeRatioRule,
  relativePosition: relativePosition,
  gradeZone: gradeZone,
  gradeOutlook: gradeOutlook,
};

if (typeof module !== 'undefined') module.exports = gcRoot.GC.calc;

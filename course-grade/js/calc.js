// 순수 계산 함수만 둔다. DOM, localStorage, Date 접근 금지.
// 브라우저와 Node 모두에서 GC 네임스페이스를 얻기 위한 루트 객체
const gcRoot = typeof window !== 'undefined' ? window : globalThis;
gcRoot.GC = gcRoot.GC || {};

const EPS = 1e-9;

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
  isEntered: isEntered,
  convertedScore: convertedScore,
  weightSum: weightSum,
  isWeightValid: isWeightValid,
  totalScore: totalScore,
  inputRate: inputRate,
  gradeRatioRule: gradeRatioRule,
  relativePosition: relativePosition,
  gradeZone: gradeZone,
  gradeOutlook: gradeOutlook,
};

if (typeof module !== 'undefined') module.exports = gcRoot.GC.calc;

// 순수 계산 함수만 둔다. DOM, localStorage, Date 접근 금지.
// 브라우저와 Node 모두에서 GC 네임스페이스를 얻기 위한 루트 객체
const gcRoot = typeof window !== 'undefined' ? window : globalThis;
gcRoot.GC = gcRoot.GC || {};

gcRoot.GC.calc = {
  EPS: 1e-9,

  // Step 2에서 구현:
  // convertedScore(item), currentScore(items), weightSum(items),
  // requiredFinalScore(...), relativePosition(...)
};

if (typeof module !== 'undefined') module.exports = gcRoot.GC.calc;

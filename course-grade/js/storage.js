// localStorage 접근은 이 파일에서만 한다. 실패하면 메모리 상태로 동작한다.
window.GC = window.GC || {};

GC.storage = (function () {
  const KEY = 'courseGrade.v1';
  const VERSION = 1;
  let memoryState = null; // localStorage 사용 불가 시 폴백

  function createDefaultItems() {
    return [
      { id: 'mid', name: '중간', weight: 30, max: 100, score: null, rank: null, isFinal: false },
      { id: 'assignment', name: '과제', weight: 20, max: 100, score: null, rank: null, isFinal: false },
      { id: 'attendance', name: '출석', weight: 10, max: 100, score: null, rank: null, isFinal: false },
      { id: 'final', name: '기말', weight: 40, max: 100, score: null, rank: null, isFinal: true },
    ];
  }

  function createDefaultCourse(id, name) {
    return {
      id: id,
      name: name || '',
      credits: null,
      enrollment: null,
      items: createDefaultItems(),
      cutoffs: { A: 90, B: 80, C: 70, D: 60, F: 0 },
      target: 'A',
      gradingBasis: 'general',
    };
  }

  function createDefaultState() {
    return { version: VERSION, semesters: [], currentCourseId: null };
  }

  function isValidState(s) {
    return !!s && s.version === VERSION && Array.isArray(s.semesters) &&
      s.semesters.every(function (sem) { return sem && Array.isArray(sem.courses); });
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (isValidState(parsed)) return parsed;
      }
    } catch (e) {
      // 읽기 실패 또는 데이터 손상: 아래에서 기본값으로 대체
    }
    return memoryState && isValidState(memoryState) ? memoryState : createDefaultState();
  }

  function save(state) {
    memoryState = state;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false; // 메모리 상태로 계속 동작
    }
  }

  function reset() {
    const state = createDefaultState();
    save(state);
    return state;
  }

  return {
    load: load,
    save: save,
    reset: reset,
    createDefaultCourse: createDefaultCourse,
    createDefaultItems: createDefaultItems,
  };
})();

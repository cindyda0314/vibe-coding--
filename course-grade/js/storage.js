// localStorage 접근은 이 파일에서만 한다. 실패하면 메모리 상태로 동작한다.
window.GC = window.GC || {};

GC.storage = (function () {
  const KEY = 'courseGrade.v1';
  const VERSION = 1;
  const TERMS = ['1학기', '여름학기', '2학기', '겨울학기'];
  let memoryState = null; // localStorage 사용 불가 시 폴백
  let persisted = true; // 마지막 save()가 localStorage에 성공했는지

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
    return { version: VERSION, semesters: [], currentSemesterId: null, currentCourseId: null };
  }

  function isValidState(s) {
    return !!s && s.version === VERSION && Array.isArray(s.semesters) &&
      s.semesters.every(function (sem) { return sem && typeof sem.id === 'string' && Array.isArray(sem.courses); });
  }

  function newId(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function findCourse(state, courseId) {
    for (let i = 0; i < state.semesters.length; i++) {
      const course = state.semesters[i].courses.find(function (c) { return c.id === courseId; });
      if (course) return { semester: state.semesters[i], course: course };
    }
    return null;
  }

  // 현재 선택이 존재하지 않는 id를 가리키지 않도록 보정한다.
  function normalize(state) {
    const found = state.currentCourseId ? findCourse(state, state.currentCourseId) : null;
    if (found) {
      state.currentSemesterId = found.semester.id;
    } else {
      state.currentCourseId = null;
      const semOk = state.semesters.some(function (s) { return s.id === state.currentSemesterId; });
      if (!semOk) state.currentSemesterId = state.semesters.length ? state.semesters[0].id : null;
    }
    return state;
  }

  function load() {
    if (!persisted && memoryState && isValidState(memoryState)) {
      return normalize(JSON.parse(JSON.stringify(memoryState)));
    }
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (isValidState(parsed)) return normalize(parsed);
      }
    } catch (e) {
      // 읽기 실패 또는 데이터 손상: 아래에서 기본값으로 대체
    }
    return createDefaultState();
  }

  function save(state) {
    memoryState = state;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      persisted = true;
    } catch (e) {
      persisted = false; // 메모리 상태로 계속 동작
    }
    return persisted;
  }

  function reset() {
    const state = createDefaultState();
    save(state);
    return state;
  }

  // load → 수정 → 보정 → save. fn의 반환값을 그대로 돌려준다.
  function mutate(fn) {
    const state = load();
    const result = fn(state);
    save(normalize(state));
    return result;
  }

  function isPersisted() {
    return persisted;
  }

  // 학기 이름은 연도와 학기 종류를 조합해 만든다. 이미 있으면 기존 학기를 선택한다.
  function addSemester(year, term) {
    const y = Number(year);
    if (!Number.isInteger(y) || y < 1900 || y > 2999 || TERMS.indexOf(term) === -1) return null;
    const trimmed = y + '학년도 ' + term;
    return mutate(function (state) {
      let sem = state.semesters.find(function (s) { return s.name === trimmed; });
      if (!sem) {
        sem = { id: newId('s_'), name: trimmed, courses: [] };
        state.semesters.push(sem);
      }
      state.currentSemesterId = sem.id;
      state.currentCourseId = null;
      return sem;
    });
  }

  function deleteSemester(id) {
    mutate(function (state) {
      state.semesters = state.semesters.filter(function (s) { return s.id !== id; });
      if (state.currentSemesterId === id) {
        state.currentSemesterId = null;
        state.currentCourseId = null;
      }
    });
  }

  function addCourse(semId, meta) {
    const name = String((meta && meta.name) || '').trim();
    if (!name) return null;
    return mutate(function (state) {
      const sem = state.semesters.find(function (s) { return s.id === semId; });
      if (!sem) return null;
      const course = createDefaultCourse(newId('c_'), name);
      course.credits = meta.credits == null ? null : meta.credits;
      course.enrollment = meta.enrollment == null ? null : meta.enrollment;
      sem.courses.push(course);
      state.currentSemesterId = sem.id;
      state.currentCourseId = course.id;
      return course;
    });
  }

  // 이름·학점·수강 인원만 갱신한다. 성적 항목 등은 건드리지 않는다.
  function updateCourseMeta(courseId, patch) {
    return mutate(function (state) {
      const found = findCourse(state, courseId);
      if (!found) return null;
      const name = String(patch.name == null ? found.course.name : patch.name).trim();
      if (!name) return null;
      found.course.name = name;
      if ('credits' in patch) found.course.credits = patch.credits;
      if ('enrollment' in patch) found.course.enrollment = patch.enrollment;
      return found.course;
    });
  }

  // 성적 입력 페이지용. 허용된 키만 덮어쓴다 (id·이름·학점·인원은 건드리지 않음).
  const GRADE_KEYS = ['items', 'cutoffs', 'target', 'gradingBasis'];

  function updateCourseGrades(courseId, patch) {
    return mutate(function (state) {
      const found = findCourse(state, courseId);
      if (!found) return null;
      GRADE_KEYS.forEach(function (key) {
        if (key in patch) found.course[key] = patch[key];
      });
      return found.course;
    });
  }

  function deleteCourse(courseId) {
    mutate(function (state) {
      const found = findCourse(state, courseId);
      if (!found) return;
      found.semester.courses = found.semester.courses.filter(function (c) { return c.id !== courseId; });
      if (state.currentCourseId === courseId) {
        const next = found.semester.courses[0];
        state.currentCourseId = next ? next.id : null;
      }
    });
  }

  function setCurrent(semId, courseId) {
    mutate(function (state) {
      state.currentSemesterId = semId;
      state.currentCourseId = courseId || null;
    });
  }

  function getCurrentCourse() {
    const state = load();
    const found = state.currentCourseId ? findCourse(state, state.currentCourseId) : null;
    return found ? found.course : null;
  }

  return {
    load: load,
    save: save,
    reset: reset,
    isPersisted: isPersisted,
    TERMS: TERMS,
    newId: newId,
    createDefaultCourse: createDefaultCourse,
    createDefaultItems: createDefaultItems,
    addSemester: addSemester,
    deleteSemester: deleteSemester,
    addCourse: addCourse,
    updateCourseMeta: updateCourseMeta,
    updateCourseGrades: updateCourseGrades,
    deleteCourse: deleteCourse,
    setCurrent: setCurrent,
    getCurrentCourse: getCurrentCourse,
  };
})();

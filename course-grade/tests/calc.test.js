// 실행: node tests/calc.test.js
const assert = require('assert');
const calc = require('../js/calc.js');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log('ok - ' + name);
}

test('calc module loads', function () {
  assert.ok(calc && typeof calc === 'object');
});

// Step 2에서 환산 점수, 필요 최종 점수 경계, 상대 위치 테스트 추가

console.log(passed + ' passed');

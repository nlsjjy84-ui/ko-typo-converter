// 테스트 준비 — extension.js가 쓰는 'vscode' 모듈을 저장소 안의 흉내 모듈(test/mocks/vscode.js)로 연결한다.
// 예전에는 이 흉내 모듈이 node_modules 안에만 있어 내 PC에서만 테스트가 돌았다.
// 저장소에 넣고 여기서 연결하면, 새로 받은 컴퓨터와 GitHub Actions에서도 똑같이 돈다.
const Module = require('module');
const path = require('path');
const MOCK = path.join(__dirname, 'mocks', 'vscode.js');
const original = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'vscode') return MOCK;
  return original.call(this, request, ...rest);
};

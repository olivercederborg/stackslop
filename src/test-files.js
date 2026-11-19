// *.test.*, *.spec.*, *.test-utils.*, and anything under __tests__/, test/, tests/ or e2e/.
globalThis.isTestFile = (path) => /\.(test|spec|test-utils)\.[^/]+$|(^|\/)(__tests__|tests?|e2e)\//.test(path);

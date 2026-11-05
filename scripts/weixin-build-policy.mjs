// These engines are bundled/minified CommonJS at build time. Re-transpiling
// them in DevTools duplicates helpers and can exceed the upload package limit.
export const PREBUILT_WEIXIN_ENGINES = ['pdf-import/engine.js', 'roster-import/engine.js', 'workers/scan.js'];
export function assertWeixinBuildPolicy(project) {
  if (project.setting?.minified !== true) throw new Error('WeChat upload must enable JavaScript minification.');
  if (project.setting?.es6 !== true) throw new Error('Keep ES6 compilation enabled for the application.');
  const ignored = project.setting?.babelSetting?.ignore;
  for (const engine of PREBUILT_WEIXIN_ENGINES) {
    if (!Array.isArray(ignored) || !ignored.includes(engine)) throw new Error(`Prebuilt engine must skip DevTools Babel: ${engine}`);
  }
}

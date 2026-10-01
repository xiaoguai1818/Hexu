import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {join,resolve,relative,dirname} from 'node:path';

function files(root: string): string[] {
  return readdirSync(root,{withFileTypes:true}).flatMap(x => x.isDirectory()?files(join(root,x.name)):[join(root,x.name)]).filter(x => x.endsWith('.ts'));
}
test('domain and application obey inward dependency boundaries', () => {
  const roots=['src/core','src/ports','src/application'];
  for (const root of roots) for (const file of files(root)) {
    const text=readFileSync(file,'utf8');
    for (const match of text.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
      const spec=match[1]!;
      assert.ok(spec.startsWith('.'),`${file}: nonlocal dependency ${spec}`);
      const target=relative(resolve('src'),resolve(dirname(file),spec)).replaceAll('\\','/');
      const allowed=root==='src/core'?['core/']:root==='src/ports'?['core/','ports/']:['core/','ports/','application/'];
      assert.ok(allowed.some(p => target.startsWith(p)),`${file} -> ${target}`);
    }
    assert.doesNotMatch(text,/\beval\s*\(|\bFunction\s*\(|import\s*\(/);
  }
});
test('both stage skills are packaged with non-escalating instructions', () => {
  const analyst=readFileSync('skills/requirements/SKILL.md','utf8');
  const developer=readFileSync('skills/development/SKILL.md','utf8');
  assert.match(analyst,/需求/); assert.match(analyst,/不得修改代码/); assert.match(developer,/验证/);
});

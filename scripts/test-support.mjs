import {readdirSync, readFileSync, existsSync} from 'node:fs';
import {join, relative, resolve} from 'node:path';

export function discoverTests(root) {
  const suites={core:[],persistence:[],tooling:[],deployment:[]};
  function walk(dir) {
    for(const entry of readdirSync(dir,{withFileTypes:true})) {
      const file=join(dir,entry.name);
      if(entry.isSymbolicLink()) throw new Error(`Test symlink is not allowed: ${file}`);
      if(entry.isDirectory()) walk(file);
      else if(/\.(test|spec)\.(ts|mjs|js)$/.test(entry.name)) {
        const path=relative(root,file).replaceAll('\\','/');
        const suite=path.startsWith('test/persistence/')?'persistence':path.startsWith('test/quality/')?'tooling':path.startsWith('test/deployment/')?'deployment':path.split('/').length===2||path.startsWith('test/regression/')?'core':null;
        if(!suite) throw new Error(`Unassigned test file: ${path}`);
        suites[suite].push(path);
      }
    }
  }
  walk(join(root,'test'));
  for(const list of Object.values(suites)) list.sort();
  return suites;
}

export function checkTap(text, minimum=1) {
  const last=name=>{const values=[...text.matchAll(new RegExp(`^# ${name} (\\d+)\\s*$`,'gm'))]; return values.length?Number(values.at(-1)[1]):undefined;};
  const result={total:last('tests'),passed:last('pass'),failed:last('fail'),skipped:last('skipped'),cancelled:last('cancelled'),todo:last('todo')};
  if(!Number.isInteger(result.total)||result.total<minimum) throw new Error(`Missing tests: expected >=${minimum}, found ${result.total}`);
  for(const name of ['failed','skipped','cancelled','todo']) if(result[name]!==0) throw new Error(`Strict test gate: ${name}=${result[name]}`);
  if(result.passed!==result.total) throw new Error('Test totals do not reconcile');
  return result;
}

export function checkInventory(root, inventory, policy) {
  for(const [suite,config] of Object.entries(policy.suites)) {
    if(!inventory[suite]?.length) throw new Error(`Empty suite: ${suite}`);
    for(const path of config.required) if(!existsSync(join(root,path))||!inventory[suite].includes(path)) throw new Error(`Required regression is missing: ${path}`);
  }
  for(const file of Object.values(inventory).flat()) {
    const source=readFileSync(join(root,file),'utf8');
    if(/\b(?:test|it|describe)\.(?:only|skip|todo)\s*\(/.test(source)||/\b(?:skip|todo|only)\s*:\s*true\b/.test(source)) throw new Error(`Disabled/exclusive test: ${file}`);
  }
  return inventory;
}

/** Node coverage filters only loaded modules. Compare against every emitted source module. */
export async function checkCoverageInventory(root, lcov) {
  const imported=await import('typescript');
  const ts=imported.default??imported;
  const measured=new Set([...lcov.matchAll(/^SF:(.+)\r?$/gm)].map(match=>resolve(root,match[1].trim())));
  const runtime=[];
  function walk(directory) {
    for(const entry of readdirSync(directory,{withFileTypes:true})) {
      const file=join(directory,entry.name);
      if(entry.isSymbolicLink()) throw new Error(`Source symlink is not allowed: ${file}`);
      if(entry.isDirectory()) {walk(file);continue;}
      if(!/\.(?:ts|tsx|mts|cts)$/.test(entry.name)||/\.d\.(?:ts|mts|cts)$/.test(entry.name)) continue;
      const source=readFileSync(file,'utf8'),path=relative(root,file).replaceAll('\\','/');
      if(/node:coverage\s+(?:disable|ignore)/.test(source)) throw new Error(`Coverage suppression is not allowed: ${path}`);
      const emitted=ts.transpileModule(source,{fileName:file,compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,verbatimModuleSyntax:true,removeComments:true}}).outputText;
      // Pure interfaces/types emit only an empty module marker and have no runtime behavior.
      if(!emitted.replace(/\bexport\s*\{\s*\}\s*;?/g,'').trim()) continue;
      runtime.push(path);
      if(!measured.has(resolve(file))) throw new Error(`Coverage omitted runtime module: ${path}`);
    }
  }
  walk(join(root,'src'));
  if(runtime.length===0) throw new Error('No runtime source files found');
  return runtime.sort();
}

import {execFileSync} from 'node:child_process';
import {readFileSync,lstatSync} from 'node:fs';
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const findings=[];
for(const path of files){
  if(lstatSync(path).isSymbolicLink())findings.push({path,reason:'tracked symlink requires review'});
  if(/(^|\/)(node_modules|\.data|ci-results)(\/|$)|(^|\/)\.env($|\.(?!example$))|\.sqlite(?:-|$)|\.(pem|key)$/.test(path))findings.push({path,reason:'runtime data or credential path'});
  const text=readFileSync(path,'utf8');
  if(/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----|(?:ghp_|github_pat_)[A-Za-z0-9_]{30,}|\bsk-[A-Za-z0-9]{32,}/.test(text))findings.push({path,reason:'secret-like material; value withheld'});
}
console.log(JSON.stringify({scope:'tracked-file patterns; not proof that all secrets are absent',files:files.length,findings},null,2));
if(findings.length)process.exitCode=1;

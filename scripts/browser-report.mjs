import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export function checkBrowserReport(report,minimum) {
  const stats=report?.stats;
  if(!stats||stats.expected<minimum||stats.unexpected!==0||stats.flaky!==0||stats.skipped!==0||report.errors?.length)throw new Error('Browser suite must contain only passing, non-skipped, non-flaky results');
  return stats;
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){const policy=JSON.parse(readFileSync('ci/suites.json','utf8'));console.log(checkBrowserReport(JSON.parse(readFileSync(process.argv[2],'utf8')),policy.suites.browser.minimum));}

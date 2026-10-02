import {pathToFileURL} from 'node:url';
export function requireAllLayers(jobs) {
  for(const name of ['regression','deployment','mutation','security','web']) {
    if(jobs?.[name]?.result!=='success')throw new Error(`${name}: ${jobs?.[name]?.result??'missing'}`);
  }
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url) {
  requireAllLayers(JSON.parse(process.env.REQUIRED_JOB_RESULTS??'null'));
  console.log('Engineering gate passed; product readiness is reported separately and is not implied.');
}

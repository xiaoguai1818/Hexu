// Operator-only provisioning: JSON on stdin, never a password in argv or logs.
import {SqliteWorkspace} from '../dist/adapters/sqlite/workspace.js';
import {CryptoPasswords} from '../dist/adapters/auth/crypto-passwords.js';
import {AuthService} from '../dist/application/auth-service.js';
import {resolve,join} from 'node:path';
process.umask(0o077);
let store;
try{
  let text='';for await(const chunk of process.stdin){text+=chunk;if(text.length>2048)throw new Error('Input too large');}
  const input=JSON.parse(text);store=new SqliteWorkspace(join(resolve(process.env.HEXU_DATA_DIR??'.data'),'workspace.sqlite'));
  const user=await new AuthService(store,new CryptoPasswords(),Date.now).provision(input.username,input.password);
  console.log(`Account created: ${user.username}`);
}catch(error){
  const code=['ACCOUNT_EXISTS','INVALID_INPUT','SCHEMA_TOO_NEW'].includes(error?.code)?error.code:'INVALID_PROVISIONING_INPUT_OR_STORAGE';
  console.error(`Account provisioning failed: ${code}`);process.exitCode=1;
}finally{store?.close();}

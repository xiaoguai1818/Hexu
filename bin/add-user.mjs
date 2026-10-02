// Operator-only provisioning: JSON on stdin, never a password in argv or logs.
import {SqliteWorkspace} from '../dist/adapters/sqlite/workspace.js';
import {CryptoPasswords} from '../dist/adapters/auth/crypto-passwords.js';
import {AuthService} from '../dist/application/auth-service.js';
import {resolve,join} from 'node:path';
process.umask(0o077);
let text='';for await(const chunk of process.stdin){text+=chunk;if(text.length>2048)throw new Error('Input too large');}
const input=JSON.parse(text);const store=new SqliteWorkspace(join(resolve(process.env.HEXU_DATA_DIR??'.data'),'workspace.sqlite'));
try{const user=await new AuthService(store,new CryptoPasswords(),Date.now).provision(input.username,input.password);console.log(`Account created: ${user.username}`);}finally{store.close();}

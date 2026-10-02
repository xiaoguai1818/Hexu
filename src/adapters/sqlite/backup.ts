import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync,mkdtempSync,chmodSync,linkSync,rmSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {DomainError,requireText} from '../../core/errors.ts';

/** Produce a standalone, consistent SQLite backup, including committed WAL pages.
 * The caller supplies approved local paths. This is not a filesystem sandbox.
 * Publish only a verified complete file, and never overwrite an existing destination.
 */
export async function createDatabaseBackup(sourcePath:string,destinationPath:string):Promise<void> {
  const source=resolve(requireText(sourcePath,'backup source',4096));
  const destination=resolve(requireText(destinationPath,'backup destination',4096));
  if(source===destination) throw new DomainError('INVALID_INPUT','Backup destination must differ from source');
  // readOnly prevents a typo from creating and successfully backing up an empty DB.
  const database=new DatabaseSync(source,{readOnly:true,timeout:5000});
  let temporary:string|undefined;
  try {
    const directory=dirname(destination);mkdirSync(directory,{recursive:true,mode:0o700});
    temporary=mkdtempSync(join(directory,'.hexu-backup-'));
    const staged=join(temporary,'snapshot.sqlite');
    await backup(database,staged);
    const check=new DatabaseSync(staged,{readOnly:true});
    try {
      const result=check.prepare('PRAGMA integrity_check').get();
      if(result?.['integrity_check']!=='ok') throw new DomainError('BACKUP_INTEGRITY_FAILED');
    } finally {check.close();}
    chmodSync(staged,0o600);
    // Same-filesystem link is atomic and fails for any existing file or symlink.
    linkSync(staged,destination);
  } catch(error) {
    if(error!==null&&typeof error==='object'&&'code' in error&&error.code==='EEXIST') throw new DomainError('BACKUP_TARGET_EXISTS');
    throw error;
  } finally {
    try {database.close();} finally {if(temporary) rmSync(temporary,{recursive:true,force:true});}
  }
}

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

export function prologWorker(program, swipl) {
  const child = spawn(swipl,['-q','-f','none','-s',fileURLToPath(program)],{stdio:['pipe','pipe','inherit']});
  const exited = new Promise(resolve => {
    child.once('error',error => resolve(error.message));
    child.once('close',(code,signal) => resolve(signal ?? code));
  });
  child.stdin.on('error',() => {}); // The pending read reports the process exit.
  const lines = createInterface({input:child.stdout})[Symbol.asyncIterator]();
  let pending = Promise.resolve();
  let closed = false;
  return {
    request(message) {
      if (closed) return Promise.reject(new Error('Prolog worker is closed'));
      const result = pending.then(async () => {
        child.stdin.write(JSON.stringify(message)+'\n');
        const line = await lines.next();
        if (line.done) throw Error('Prolog stopped before replying: '+await exited);
        return JSON.parse(line.value);
      });
      pending = result.catch(() => {});
      return result;
    },
    async close() {
      closed = true;
      await pending;
      child.stdin.end();
      const code = await exited;
      if (code !== 0) throw Error('Prolog failed: '+code);
    }
  };
}

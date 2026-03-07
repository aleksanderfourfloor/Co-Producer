import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(here, 'Co-Producer Bridge.maxpat');
const outputPath = join(here, 'Co-Producer Bridge.amxd');

const patcher = await readFile(sourcePath, 'utf8');
const patchBuffer = Buffer.from(`${patcher.trimEnd()}\n\0`, 'utf8');
const header = Buffer.concat([
  Buffer.from('ampf', 'ascii'),
  Buffer.from([0x04, 0x00, 0x00, 0x00]),
  Buffer.from('mmmm', 'ascii'),
  Buffer.from('meta', 'ascii'),
  Buffer.from([0x04, 0x00, 0x00, 0x00]),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('ptch', 'ascii'),
  Buffer.from(Uint32Array.of(patchBuffer.length).buffer)
]);

await writeFile(outputPath, Buffer.concat([header, patchBuffer]));
console.log(`Wrote ${outputPath}`);

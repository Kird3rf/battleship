// Minimal static file server so the game can be opened over http://.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT ?? 8000);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

createServer(async (req, res) => {
  const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const relative = normalize(requested === '/' ? 'index.html' : requested.slice(1));
  if (relative.startsWith('..')) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const body = await readFile(join(root, relative));
    res.writeHead(200, { 'content-type': types[extname(relative)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, () => {
  console.log(`Battleship running at http://localhost:${port}`);
});

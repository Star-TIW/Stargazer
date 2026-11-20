const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0').filter(Boolean)
  .filter(file => (file.endsWith('.js') || file.endsWith('.cjs')) && !file.startsWith('node_modules/') && !file.startsWith('vendor/'));

test('every tracked JavaScript and test file parses, including movies.js', () => {
  assert.ok(tracked.includes('movies.js'), 'movies.js must be checked');
  for (const file of tracked) {
    assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', path.join(root, file)], {
      cwd: root, encoding: 'utf8', stdio: 'pipe'
    }), 'Syntax error in ' + file);
  }
});

test('changed player files contain no accidentally escaped source newlines', () => {
  for (const file of ['movies.js', 'player-sources.js', 'movies.css']) {
    const source = readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(source, /\\n\s{4,}\S/, 'Escaped newline in ' + file);
  }
});

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8')

test('package metadata identifies the DSH bundle', async () => {
  const pkg = JSON.parse(await read('package.json'))
  assert.equal(pkg.name, 'dsh-doorbell')
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.match(pkg.engines.dsh, /^>=0\.2\.0-rc\.1/)
  assert.ok(pkg.files.includes('cordis.patch.yml'))
  assert.ok(pkg.files.includes('lib'))
})

test('bundle patch inserts the doorbell row', async () => {
  const patch = await read('cordis.patch.yml')
  assert.match(patch, /id:\s*doorbell/)
  assert.match(patch, /name:\s*dsh-doorbell/)
})

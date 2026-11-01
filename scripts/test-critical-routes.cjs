// Offline route tests: transpile actual handlers and replace every external
// import with mocks. No Next server, environment files or network access used.
const fs = require('node:fs')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const { test } = require('node:test')
const ts = require('typescript')

function load(file, imports, env = {}) {
  const source = fs.readFileSync(file, 'utf8')
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  vm.runInNewContext(code, {
    exports, Request, Response, URL,
    process: { env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.invalid',
      SUPABASE_SERVICE_ROLE_KEY: 'fixture-only',
      OMNINET_APP_ORIGIN: 'https://app.fixture.invalid',
      ...env,
    } },
    require(name) {
      if (!Object.hasOwn(imports, name)) throw new Error(`Unexpected import: ${name}`)
      return imports[name]
    },
  }, { filename: file })
  return exports
}

const csrf = load('src/lib/same-origin-mutation.ts', {})
function setup(kind, options = {}) {
  const calls = []
  const owner = options.owner === undefined ? 'owner-a' : options.owner
  const admin = {
    from(table) {
      calls.push(['from', table])
      return {
        select() { return this },
        eq(column, value) { calls.push(['eq', column, value]); return this },
        async maybeSingle() {
          return { data: owner === null ? null : { id: 'tag-fixture', user_id: owner },
            error: options.lookupError || null }
        },
      }
    },
    async rpc(name, args) {
      calls.push(['rpc', name, args])
      return { data: options.rpcFalse ? false : kind === 'delete' ? true
        : { ok: true, block: { id: 'block-fixture' }, paused_ids: ['old-fixture'] },
        error: options.rpcError || null }
    },
  }
  const imports = {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/supabase-server': { getSupabaseServer: async () => ({ auth: {
      getUser: async () => ({ data: { user: options.anonymous ? null : { id: 'owner-a' } },
        error: options.authError || null }),
    } }) },
    '@/lib/same-origin-mutation': csrf,
    '@/lib/supabaseAdmin': { getSupabaseAdmin: () => { calls.push(['admin']); return admin } },
    '@supabase/supabase-js': { createClient: () => { calls.push(['admin']); return admin } },
  }
  const route = load(kind === 'delete' ? 'src/app/api/tags/delete/route.ts'
    : 'src/app/api/blocks/create/route.ts', imports)
  const headers = { 'Content-Type': 'application/json', Origin: 'https://app.fixture.invalid',
    Host: 'app.fixture.invalid',
    ...options.headers }
  if (options.noOrigin) delete headers.Origin
  const body = options.body === undefined ? (kind === 'delete'
    ? { tag_id: 'tag-fixture', owner_id: 'attacker-supplied' }
    : { message_id: 'tag-fixture', title: 'Fixture', status: 'draft',
      owner_id: 'attacker-supplied' }) : options.body
  return { calls, run: () => route.POST(new Request(
    `https://app.fixture.invalid/api/${kind}`, {
      method: 'POST', headers, body: options.invalidJson ? '{' : JSON.stringify(body),
    })) }
}

for (const kind of ['create', 'delete']) {
  for (const [name, options, expected] of [
    ['anonymous', { anonymous: true }, 401],
    ['invalid session', { authError: { message: 'private auth failure' } }, 401],
    ['other business', { owner: 'owner-b' }, 403],
    ['ownerless', { owner: '' }, 403],
    ['missing message', { owner: null }, kind === 'delete' ? 403 : 404],
    ['cross-site origin', { headers: { Origin: 'https://attacker.invalid' } }, 403],
    ['missing origin', { noOrigin: true }, 403],
    ['opaque origin', { headers: { Origin: 'null' } }, 403],
    ['cross-site fetch metadata', { headers: { 'Sec-Fetch-Site': 'cross-site' } }, 403],
    ['invalid JSON', { invalidJson: true }, 400],
    ['invalid body', { body: null }, 400],
    ['lookup failure', { lookupError: { message: 'sensitive database detail' } }, 500],
  ]) {
    test(`${kind}: rejects ${name} before mutation`, async () => {
      const fixture = setup(kind, options)
      const response = await fixture.run()
      assert.equal(response.status, expected)
      assert.equal(fixture.calls.filter(c => c[0] === 'rpc').length, 0)
      assert.doesNotMatch(await response.text(), /sensitive database detail|private auth failure/)
      if (expected === 401 || name.includes('origin') || name === 'cross-site fetch metadata') {
        assert.equal(fixture.calls.length, 0, 'No privileged client before authentication/CSRF')
      }
    })
  }
  test(`${kind}: canonical owner succeeds with a separate privileged client`, async () => {
    const fixture = setup(kind)
    const response = await fixture.run()
    assert.equal(response.status, 200)
    const rpc = fixture.calls.filter(c => c[0] === 'rpc')
    assert.equal(rpc.length, 1)
    assert.equal(rpc[0][1], kind === 'delete' ? 'delete_tag_cascade' : 'create_block_autopause')
    assert.equal(fixture.calls.filter(c => c[0] === 'admin').length, 1)
    if (kind === 'create') {
      assert.equal(rpc[0][2].p_owner_id, 'owner-a')
      assert.equal(rpc[0][2].p_message_id, 'tag-fixture')
      assert.deepEqual(await response.json(), {
        ok: true, block: { id: 'block-fixture' }, paused_ids: ['old-fixture'],
      })
    } else {
      assert.equal(rpc[0][2].tag_id, 'tag-fixture')
      assert.deepEqual(await response.json(), { ok: true })
    }
  })
}

test('delete: database failures expose only minimal errors', async () => {
  const response = await setup('delete', { rpcError: {
    message: 'sensitive database detail', details: 'secret internal context',
  } }).run()
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { ok: false, error: 'DELETE_FAILED' })
})

test('delete: false RPC result is not reported as success', async () => {
  const response = await setup('delete', { rpcFalse: true }).run()
  assert.equal(response.status, 500)
})

test('browser deletion uses the server endpoint rather than privileged RPC', () => {
  const source = fs.readFileSync('src/app/my/_client.tsx', 'utf8')
  assert.match(source, /fetch\('\/api\/tags\/delete'/)
  assert.doesNotMatch(source, /\.rpc\(/)
})

for (const [name, configured, origin, host, expected] of [
  ['correct public origin', 'https://app.fixture.invalid', 'https://app.fixture.invalid', 'app.fixture.invalid', true],
  ['mismatched origin', 'https://app.fixture.invalid', 'https://evil.invalid', 'app.fixture.invalid', false],
  ['missing origin', 'https://app.fixture.invalid', undefined, 'app.fixture.invalid', false],
  ['null origin', 'https://app.fixture.invalid', 'null', 'app.fixture.invalid', false],
  ['invalid origin', 'https://app.fixture.invalid', 'not a URL', 'app.fixture.invalid', false],
  ['origin with path', 'https://app.fixture.invalid', 'https://app.fixture.invalid/path', 'app.fixture.invalid', false],
  ['unexpected host', 'https://app.fixture.invalid', 'https://app.fixture.invalid', 'evil.invalid', false],
  ['missing host', 'https://app.fixture.invalid', 'https://app.fixture.invalid', undefined, false],
  ['invalid configured origin', 'not a URL', 'https://app.fixture.invalid', 'app.fixture.invalid', false],
  ['missing configured origin', '', 'https://app.fixture.invalid', 'app.fixture.invalid', false],
  ['configured credentials', 'https://user:password@app.fixture.invalid', 'https://app.fixture.invalid', 'app.fixture.invalid', false],
  ['configured path', 'https://app.fixture.invalid/path', 'https://app.fixture.invalid', 'app.fixture.invalid', false],
  ['configured query', 'https://app.fixture.invalid/?x=1', 'https://app.fixture.invalid', 'app.fixture.invalid', false],
  ['insecure public configuration', 'http://app.fixture.invalid', 'http://app.fixture.invalid', 'app.fixture.invalid', false],
]) {
  test(`CSRF: ${name}`, () => {
    const helper = load('src/lib/same-origin-mutation.ts', {}, { OMNINET_APP_ORIGIN: configured })
    const headers = { 'X-Forwarded-Host': 'app.fixture.invalid', 'X-Forwarded-Proto': 'https' }
    if (origin !== undefined) headers.Origin = origin
    if (host !== undefined) headers.Host = host
    // Public Host is validated even if the proxy reconstructs an internal URL.
    assert.equal(helper.isSameOriginMutation(new Request('http://internal-proxy:3000/api/write', {
      method: 'POST', headers,
    })), expected)
  })
}

for (const field of ['capacity_total', 'capacity_remaining', 'price_pence', 'sort_rank']) {
  for (const value of [1.5, 2147483648, '1']) {
    test(`create: rejects incompatible integer ${field}=${value}`, async () => {
      const fixture = setup('create', { body: {
        message_id: 'tag-fixture', title: 'Fixture', status: 'draft', [field]: value,
      } })
      assert.equal((await fixture.run()).status, 400)
      assert.equal(fixture.calls.filter(c => c[0] === 'rpc').length, 0)
    })
  }
}

test('create: all 16 named parameters and nullable values are forwarded', async () => {
  const fixture = setup('create')
  assert.equal((await fixture.run()).status, 200)
  const args = fixture.calls.find(c => c[0] === 'rpc')[2]
  assert.deepEqual(Object.keys(args).sort(), [
    'p_message_id', 'p_title', 'p_owner_id', 'p_description', 'p_start_at',
    'p_end_at', 'p_timezone', 'p_capacity_total', 'p_capacity_remaining',
    'p_status', 'p_action_type', 'p_visibility', 'p_price_pence', 'p_currency',
    'p_sort_rank', 'p_meta',
  ].sort())
  for (const key of ['p_description', 'p_start_at', 'p_end_at', 'p_capacity_remaining']) {
    assert.equal(args[key], null)
  }
})

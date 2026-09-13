const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { Readable } = require("node:stream");
const root = path.resolve(__dirname, "..");
process.env.LOCAL_DATA = "1";
process.env.SESSION_SECRET = "test-session-secret-not-used-by-any-deployment";
process.env.ADMIN_TOKEN = "test-admin-token-not-used-by-any-deployment";
delete process.env.GITHUB_TOKEN;
const repository = require("../lib/repository.cjs");
const catalog = require("../lib/catalog.cjs");
const auth = require("../lib/auth.cjs");
const save = require("../lib/save.cjs");
const state = JSON.parse(
  fs.readFileSync(path.join(root, "state.json"), "utf8"),
);
const records = catalog.normalize(state);
function req({ method = "GET", query = {}, headers = {}, body } = {}) {
  const r = Readable.from(
    body === undefined
      ? []
      : [Buffer.from(typeof body === "string" ? body : JSON.stringify(body))],
  );
  r.method = method;
  r.query = query;
  r.headers = { host: "example.test", ...headers };
  return r;
}
function res() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    end(body) {
      this.body = body;
      return this;
    },
    json(body) {
      this.body = JSON.stringify(body);
      return this;
    },
  };
}
function body(response) {
  return JSON.parse(
    response.headers["content-encoding"] === "gzip"
      ? zlib.gunzipSync(response.body)
      : response.body,
  );
}
const tinyState = () => ({
  added: [
    {
      key: "added_test",
      title: "Test",
      prompt: "Private text",
      images: [],
      cats: [],
    },
  ],
  deleted: [],
  order: ["added_test"],
  customImgs: {},
  freeMode: "off",
});

test("migration preserves every surviving key, order, title, prompt and image precedence", () => {
  assert.equal(
    crypto
      .createHash("sha256")
      .update(JSON.stringify(catalog.originals))
      .digest("hex"),
    "92c54f3e876a78ff57c7934b772dfa1900b4b61ecc9711be8ced263da7b16f3c",
    "Original records must match the migration from commit 7e300e1",
  );
  const titles = catalog.originals.map((p) => p.title),
    prompts = catalog.originals.map((p) => p.prompt),
    images = catalog.originals.map((p) => p.images);
  const reference = [];
  for (let i = 0; i < titles.length; i++)
    reference.push({
      key: "orig_" + i,
      title: titles[i],
      prompt: prompts[i],
      images: images[i],
    });
  reference.push(...state.added);
  const surviving = reference.filter((p) => !state.deleted.includes(p.key));
  const expectedOrder = surviving.map((p) => p.key);
  for (const key of state.order) {
    const index = expectedOrder.indexOf(key);
    if (index !== -1) expectedOrder.push(...expectedOrder.splice(index, 1));
  }
  assert.equal(records.length, surviving.length);
  assert.deepEqual(
    records.map((p) => p.key),
    expectedOrder,
  );
  for (const record of records) {
    const expected = {
      ...surviving.find((p) => p.key === record.key),
      ...state.promptEdits?.[record.key],
    };
    assert.equal(record.title, expected.title);
    assert.equal(record.prompt, expected.prompt);
    const sources = state.customImgs[record.key]
      ? [state.customImgs[record.key]]
      : expected.images;
    assert.deepEqual(
      record.images,
      (sources || []).map(catalog.imageSource).filter(Boolean),
    );
  }
});
test("categories and free flags preserve the existing catalog membership", () => {
  for (const category of state.customCats) {
    const expected = records
      .filter((p) => {
        const legacy = p.key.startsWith("orig_")
          ? state.promptEdits[p.key]
          : state.added.find((x) => x.key === p.key);
        return (
          legacy?.cats?.includes(category.id) ||
          (!legacy?.cats?.length && legacy?.cat === category.label)
        );
      })
      .map((p) => p.key);
    assert.deepEqual(
      catalog.search(records, { category: category.id }).map((p) => p.key),
      expected,
    );
  }
  assert.deepEqual(
    catalog.search(records, { category: "free" }).map((p) => p.key),
    records.filter((p) => state.freePrompts[p.key]).map((p) => p.key),
  );
});
test("catalog API returns only bounded metadata, with small compressed payload", async () => {
  const response = res();
  await require("../api/catalog.js")(
    req({ headers: { "accept-encoding": "gzip" } }),
    response,
  );
  const data = body(response);
  assert.equal(response.statusCode, 200);
  assert.equal(data.items.length, 36);
  assert.equal(data.total, records.length);
  assert.equal(data.pages, Math.ceil(records.length / 36));
  assert(!data.items.some((p) => Object.hasOwn(p, "prompt")));
  assert(
    response.body.length < 16000,
    "First catalog response should remain under 16KB gzip",
  );
  assert(data.items.every((p) => !p.image || p.image.srcSet.includes("320w")));
});
test("paging is stable and clamps limits and pages", async () => {
  const response = res();
  await require("../api/catalog.js")(
    req({ query: { page: "2", limit: "36" } }),
    response,
  );
  assert.deepEqual(
    body(response).items.map((p) => p.key),
    records.slice(36, 72).map((p) => p.key),
  );
  const last = res();
  await require("../api/catalog.js")(
    req({ query: { page: "99999", limit: "99999" } }),
    last,
  );
  assert(body(last).items.length <= 48);
  assert.equal(body(last).page, body(last).pages);
});
test("search finds prompt text beyond the first page; favorites span the entire catalog", async () => {
  const target = records[600];
  const query = target.prompt.slice(0, 90);
  assert(!target.title.includes(query));
  assert(
    catalog.search(records, { q: query }).some((p) => p.key === target.key),
  );
  const response = res();
  const keys = [records[0].key, records.at(-1).key];
  await require("../api/catalog.js")(
    req({ method: "POST", body: { keys } }),
    response,
  );
  assert.deepEqual(
    body(response).items.map((p) => p.key),
    keys,
  );
  const empty = res();
  await require("../api/catalog.js")(
    req({ method: "POST", body: { keys: [] } }),
    empty,
  );
  assert.equal(body(empty).total, 0);
});
test("public full-state reads and unauthenticated saves are rejected before processing input", async () => {
  for (const name of ["state", "save"]) {
    const response = res();
    await require("../api/" + name + ".js")(
      req({ method: name === "save" ? "POST" : "GET", body: "{broken" }),
      response,
    );
    assert.equal(response.statusCode, 401);
  }
  const response = res();
  await require("../api/save.js")(
    req({
      method: "POST",
      headers: {
        "x-admin-token": process.env.ADMIN_TOKEN,
        origin: "https://evil.example",
      },
      body: {},
    }),
    response,
  );
  assert.equal(response.statusCode, 401);
});
test("signed sessions reject tampering and role substitution", () => {
  const response = res();
  auth.setSession(req(), response, "admin", {}, 60000);
  const cookie = response.headers["set-cookie"].split(";")[0];
  assert(auth.isAdmin(req({ headers: { cookie } })));
  assert(!auth.readSession(req({ headers: { cookie } }), "license"));
  assert(!auth.isAdmin(req({ headers: { cookie: cookie + "tamper" } })));
  assert(response.headers["set-cookie"].includes("HttpOnly"));
  assert(response.headers["set-cookie"].includes("SameSite=Strict"));
});
test("premium prompt text is withheld unless free or server-authorized", async (t) => {
  const value = tinyState();
  t.mock.method(repository, "read", async () => ({
    state: value,
    revision: "a".repeat(40),
  }));
  const run = async (headers) => {
    const r = res();
    await require("../api/prompt.js")(
      req({ query: { key: "added_test" }, headers }),
      r,
    );
    return body(r);
  };
  assert.equal((await run({})).prompt, null);
  assert.equal(
    (await run({ "x-admin-token": process.env.ADMIN_TOKEN })).prompt,
    "Private text",
  );
  value.freeMode = "partial";
  value.freePrompts = { added_test: true };
  assert.equal((await run({})).copyEnabled, true);
  value.freeMode = "catalog";
  assert.equal((await run({})).copyEnabled, false);
});
test("save validation accepts existing data and rejects malformed or duplicate records", () => {
  assert(save.validateState(state));
  assert(!save.validateState({}));
  const duplicate = tinyState();
  duplicate.added.push(duplicate.added[0]);
  assert(!save.validateState(duplicate));
});
test("stale and racing saves fail with conflict and never overwrite a newer state", async (t) => {
  t.mock.method(repository, "read", async () => ({ revision: "b".repeat(40) }));
  const put = t.mock.method(repository, "github", async () => ({
    status: 409,
  }));
  await assert.rejects(
    save.saveState({ state: tinyState(), baseRevision: "a".repeat(40) }),
    { status: 409 },
  );
  assert.equal(put.mock.calls.length, 0);
  await assert.rejects(
    save.saveState({ state: tinyState(), baseRevision: "b".repeat(40) }),
    { status: 409 },
  );
  assert.equal(
    put.mock.calls.length,
    1,
    "No automatic retry may overwrite a conflicting update",
  );
});
test("successful saves preserve fields and return the new revision", async (t) => {
  const value = tinyState();
  value.headerConfig = { title: "Preserve me" };
  t.mock.method(repository, "read", async () => ({ revision: "a".repeat(40) }));
  const put = t.mock.method(repository, "github", async () => ({
    status: 200,
    data: { content: { sha: "b".repeat(40) } },
  }));
  const result = await save.saveState({
    state: value,
    baseRevision: "a".repeat(40),
  });
  assert.equal(result.revision, "b".repeat(40));
  const submitted = JSON.parse(put.mock.calls[0].arguments[1].body);
  const saved = JSON.parse(Buffer.from(submitted.content, "base64"));
  assert.equal(submitted.sha, "a".repeat(40));
  assert.deepEqual(saved.added, value.added);
  assert.deepEqual(saved.headerConfig, value.headerConfig);
  assert(saved._publishedAt > 0);
});
test("image optimizer rejects arbitrary hosts, credentials, traversal and unbounded widths", async () => {
  const handler = require("../api/img.js");
  assert(handler.allowed(repository.RAW + "images/241.jpg"));
  for (const src of [
    "http://127.0.0.1/private",
    "https://raw.githubusercontent.com.evil.example/images/a.jpg",
    repository.RAW + "images/../keys.json",
    repository.RAW + "images/a.jpg?secret=1",
    "https://user:password@nanobananai.site/images/case1/output.webp",
  ])
    assert(!handler.allowed(src));
  const response = res();
  await handler(
    req({ query: { src: repository.RAW + "images/241.jpg", w: "99999" } }),
    response,
  );
  assert.equal(response.statusCode, 400);
});
test("HTML contains no embedded catalog or original prompt text", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const admin = fs.readFileSync(path.join(root, "admin.html"), "utf8");
  assert(Buffer.byteLength(html) < 5000);
  assert(!admin.includes("data:image/jpeg;base64,"));
  assert(!html.includes(records[500].prompt));
  for (const text of catalog.originals.slice(0, 5).map((p) => p.prompt))
    assert(!admin.includes(text));
});
test("compressed publishing requests are decoded and bounded before JSON parsing", async () => {
  const { readBody } = require("../lib/http.cjs");
  const compressed = (value) => {
    const r = Readable.from([zlib.gzipSync(JSON.stringify(value))]);
    r.headers = { "x-body-encoding": "gzip+json" };
    return r;
  };
  assert.deepEqual(await readBody(compressed({ state: tinyState() }), 4096), {
    state: tinyState(),
  });
  await assert.rejects(readBody(compressed({ text: "a".repeat(5000) }), 1000), {
    status: 413,
  });
  await assert.rejects(readBody(req({ body: [] })), { status: 400 });
});
test("license expiry and revocation are enforced without mutating license data", async (t) => {
  const data = {
    keys: {
      fixture: {
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        name: "Test",
      },
    },
  };
  t.mock.method(repository, "read", async (file) => ({
    state: file === "keys.json" ? data : tinyState(),
    revision: "a".repeat(40),
  }));
  const license = require("../api/license.js");
  const response = res();
  await license(
    req({ method: "POST", body: { license_key: "fixture" } }),
    response,
  );
  assert.equal(body(response).valid, true);
  assert.equal(body(response).expiresAt, data.keys.fixture.expiresAt);
  const cookie = response.headers["set-cookie"].split(";")[0];
  const detail = async () => {
    const r = res();
    await require("../api/prompt.js")(
      req({ query: { key: "added_test" }, headers: { cookie } }),
      r,
    );
    return body(r);
  };
  assert.equal((await detail()).prompt, "Private text");
  delete data.keys.fixture;
  assert.equal(
    (await detail()).prompt,
    null,
    "A revoked key cannot keep reading through an existing cookie",
  );
  data.keys.fixture = { expiresAt: new Date(Date.now() - 1000).toISOString() };
  const expired = res();
  await license(
    req({ method: "POST", body: { license_key: "fixture" } }),
    expired,
  );
  assert.equal(body(expired).valid, false);
  assert(expired.headers["set-cookie"].includes("Max-Age=0"));
});
test("editor uploads preserve secondary images, deduplicate sources and resume after failure", async () => {
  const { uploadPendingImages } = await import("../editor/uploads.mjs");
  const first = "data:image/png;base64,AAAA",
    second = "data:image/png;base64,BBBB";
  const value = {
    customImgs: { added_test: first },
    added: [{ images: [first, second, "https://example.test/existing.webp"] }],
  };
  const services = { gallery: [{ src: second }] };
  let calls = 0;
  await assert.rejects(
    uploadPendingImages(value, services, {
      upload: async () => {
        if (++calls === 2) throw new Error("offline");
        return "https://example.test/first.webp";
      },
    }),
    /offline/,
  );
  assert.deepEqual(value.added[0].images, [
    "https://example.test/first.webp",
    second,
    "https://example.test/existing.webp",
  ]);
  await uploadPendingImages(value, services, {
    upload: async () => {
      calls++;
      return "https://example.test/second.webp";
    },
  });
  assert.equal(calls, 3, "Only the failed image is retried");
  assert.deepEqual(value.added[0].images, [
    "https://example.test/first.webp",
    "https://example.test/second.webp",
    "https://example.test/existing.webp",
  ]);
  assert.equal(services.gallery[0].src, "https://example.test/second.webp");
});

test("Vercel previews cannot mutate production data even with valid server credentials", async () => {
  const before = {
    token: process.env.GITHUB_TOKEN,
    local: process.env.LOCAL_DATA,
    environment: process.env.VERCEL_ENV,
  };
  process.env.GITHUB_TOKEN = "fixture-never-sent";
  process.env.LOCAL_DATA = "0";
  process.env.VERCEL_ENV = "preview";
  try {
    for (const name of ["save", "keys"]) {
      const response = res();
      await require("../api/" + name + ".js")(
        req({
          method: "POST",
          headers: { "x-admin-token": process.env.ADMIN_TOKEN },
          body: "{invalid",
        }),
        response,
      );
      assert.equal(response.statusCode, 503);
    }
  } finally {
    for (const [key, value] of Object.entries({
      GITHUB_TOKEN: before.token,
      LOCAL_DATA: before.local,
      VERCEL_ENV: before.environment,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

import {
  isLoopbackHost,
  isLocalhost,
  sameMachineOnly,
  localhostOnly,
} from "../routes/request-guard.mjs";

// Minimal Express req/res fakes: only the fields the guard reads.
function makeReq({ method = "GET", headers = {}, ip = "127.0.0.1", json = false } = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    method,
    ip,
    get: (name) => lower[name.toLowerCase()],
    is: (type) => (type === "application/json" && json ? type : false),
  };
}

function run(middleware, req) {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  let nextCalled = false;
  middleware(req, res, () => (nextCalled = true));
  return { nextCalled, status: res.statusCode };
}

const LOCAL = { host: "localhost:4001" };

describe("isLoopbackHost", () => {
  test.each([
    ["localhost:4001", true],
    ["127.0.0.1:4001", true],
    ["[::1]:4001", true],
    ["localhost:5173", true], // Vite dev proxy keeps the browser's Host
    ["localhost", true],
    ["evil.example:4001", false], // DNS rebinding
    ["192.168.1.20:5173", false], // LAN client through a 0.0.0.0 Vite
    ["localhost.evil.example", false],
    [undefined, false],
  ])("%s -> %s", (host, expected) => {
    expect(isLoopbackHost(host)).toBe(expected);
  });
});

describe("isLocalhost", () => {
  test.each([
    ["127.0.0.1", true],
    ["::1", true],
    ["::ffff:127.0.0.1", true],
    ["10.0.0.5", false],
  ])("%s -> %s", (ip, expected) => {
    expect(isLocalhost({ ip })).toBe(expected);
  });
});

describe("sameMachineOnly", () => {
  test("allows a same-origin JSON POST", () => {
    const req = makeReq({
      method: "POST",
      json: true,
      headers: { ...LOCAL, origin: "http://localhost:4001", "sec-fetch-site": "same-origin" },
    });
    expect(run(sameMachineOnly, req).nextCalled).toBe(true);
  });

  test("allows Origin: null, which no-referrer same-origin fetches send", () => {
    // MainPage.js posts grades with referrerPolicy "no-referrer"; browsers then
    // serialize Origin as "null" even for same-origin requests.
    const req = makeReq({
      method: "POST",
      json: true,
      headers: { ...LOCAL, origin: "null", "sec-fetch-site": "same-origin" },
    });
    expect(run(sameMachineOnly, req).nextCalled).toBe(true);
  });

  test("allows a JSON POST with no browser headers (curl, CLI)", () => {
    const req = makeReq({ method: "POST", json: true, headers: LOCAL });
    expect(run(sameMachineOnly, req).nextCalled).toBe(true);
  });

  test("rejects a form POST with 415 — the cross-site form CSRF vector", () => {
    const req = makeReq({ method: "POST", json: false, headers: LOCAL });
    expect(run(sameMachineOnly, req)).toEqual({ nextCalled: false, status: 415 });
  });

  test("rejects a cross-site POST even if it claims JSON", () => {
    const req = makeReq({
      method: "POST",
      json: true,
      headers: { ...LOCAL, "sec-fetch-site": "cross-site" },
    });
    expect(run(sameMachineOnly, req)).toEqual({ nextCalled: false, status: 403 });
  });

  test("rejects a POST whose Origin is another site", () => {
    const req = makeReq({
      method: "POST",
      json: true,
      headers: { ...LOCAL, origin: "https://evil.example" },
    });
    expect(run(sameMachineOnly, req)).toEqual({ nextCalled: false, status: 403 });
  });

  test("rejects any request whose Host is not loopback (DNS rebinding)", () => {
    const req = makeReq({ method: "GET", headers: { host: "evil.example:4001" } });
    expect(run(sameMachineOnly, req)).toEqual({ nextCalled: false, status: 403 });
  });

  test("lets cross-origin GETs through (reads are covered by CORS)", () => {
    // The Observable notebook reads /getAllGrades cross-origin via cors().
    const req = makeReq({
      method: "GET",
      headers: { ...LOCAL, origin: "https://john-guerra.static.observableusercontent.com" },
    });
    expect(run(sameMachineOnly, req).nextCalled).toBe(true);
  });
});

describe("localhostOnly", () => {
  test("responds 403 instead of hanging for a remote client", () => {
    expect(run(localhostOnly, makeReq({ ip: "10.0.0.5" }))).toEqual({
      nextCalled: false,
      status: 403,
    });
  });

  test("passes IPv6 loopback", () => {
    expect(run(localhostOnly, makeReq({ ip: "::1" })).nextCalled).toBe(true);
  });
});

/**
 * @jest-environment node
 *
 * The SSRF guard in front of the scraper (audit Phase 2, step 2.1). DNS is
 * mocked: each hostname resolves to exactly what the real resolver returned
 * on the development machine (including for bracketed IPv6 literals, which
 * reached the DNS branch before F-003 because `new URL()` keeps the
 * brackets; an unlisted one resolves to itself, as the real resolver does),
 * and any other unlisted name fails the way an unknown name does.
 *
 * The "gaps closed by F-003" block began as `test.failing` (487eb47): each
 * test stated the safe behaviour and passed only while the guard got it wrong.
 */

jest.mock("dns/promises", () => {
  const lookup = jest.fn();
  return { __esModule: true, default: { lookup }, lookup };
});

import { validateExternalUrl as validate } from "./urlValidation";

const { lookup } = jest.requireMock("dns/promises") as { lookup: jest.Mock };
// The module imports no resolver (it is browser-safe); servers pass dns.lookup, as this does.
const resolve = (host: string) => lookup(host, { all: true, verbatim: true });
const validateExternalUrl = (url: string) => validate(url, resolve);

let records: Record<string, string[]> = {};

beforeEach(() => {
  records = {
    "example.com": ["93.184.216.34"],
    "www.bbc.com": ["151.101.0.81", "2a04:4e42::81"],
    "localhost.example.com": ["93.184.216.35"],
    "127.0.0.1.nip.io": ["127.0.0.1"],
    "metadata.attacker.example": ["169.254.169.254"],
    "mixed.attacker.example": ["93.184.216.34", "10.0.0.5"],
    "v6-loopback.attacker.example": ["::1"],
    "v6-mapped.attacker.example": ["::ffff:127.0.0.1"],
    "v6-mapped-hex.attacker.example": ["::ffff:7f00:1"],
    "v6-mapped-private.attacker.example": ["::ffff:10.0.0.1"],
    "nat64.attacker.example": ["64:ff9b::7f00:1"],
    "empty.example": [],
    // Bracketed IPv6 literals, as the real resolver answered them.
    "[::1]": ["::1"],
    "[::]": ["::"],
    "[fe80::1]": ["fe80::1"],
    "[fc00::1]": ["fc00::1"],
    "[fd12:3456::1]": ["fd12:3456::1"],
    "[::ffff:7f00:1]": ["::ffff:127.0.0.1"],
    "[::ffff:a9fe:a9fe]": ["::ffff:169.254.169.254"],
    "[::ffff:a00:1]": ["::ffff:10.0.0.1"],
    "[::ffff:c0a8:101]": ["::ffff:192.168.1.1"],
    "[2606:4700::1111]": ["2606:4700::1111"],
  };
  lookup.mockReset();
  lookup.mockImplementation(async (host: string) => {
    // The real resolver answers an unlisted bracketed literal with the literal itself.
    const literal = /^\[(.+)\]$/.exec(host)?.[1];
    const addresses = records[host] ?? (literal ? [literal] : undefined);
    if (!addresses) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: "ENOTFOUND" });
    return addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  });
});

const allowed = async (url: string) => expect((await validateExternalUrl(url)).ok).toBe(true);
const rejected = async (url: string) => expect((await validateExternalUrl(url)).ok).toBe(false);

describe("validateExternalUrl — allowed", () => {
  test.each(["https://example.com/news/story", "http://example.com", "https://www.bbc.com/news", "http://8.8.8.8/", "http://[2606:4700::1111]/"])(
    "%s",
    allowed
  );

  test("a look-alike name that resolves publicly is judged by its address, not its name", () =>
    allowed("https://localhost.example.com/"));
});

describe("validateExternalUrl — rejected", () => {
  test.each(["ftp://example.com/file", "file:///etc/passwd", "javascript:alert(1)", "data:text/html,<b>x</b>", "gopher://example.com/"])(
    "non-http(s) protocol: %s",
    rejected
  );

  test.each(["not a url", "", "http://"])("not a URL: %j", rejected);

  test.each(["http://localhost/", "http://LOCALHOST:3000/admin", "http://api.localhost/"])("localhost: %s", rejected);

  test.each([
    "http://127.0.0.1/",
    "http://127.1.2.3/",
    "http://10.0.0.1/",
    "http://172.16.0.1/",
    "http://172.31.255.255/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://0.0.0.0/",
    "http://100.64.0.1/",
    "http://198.18.0.1/",
    "http://192.0.0.1/",
    "http://224.0.0.1/",
  ])("private, loopback, link-local or reserved IPv4: %s", rejected);

  // The URL parser normalises every one of these to 127.0.0.1.
  test.each(["http://2130706433/", "http://0177.0.0.1/", "http://0x7f.0.0.1/", "http://0x7f000001/", "http://127.1/"])(
    "decimal, octal and hex IPv4 forms: %s",
    rejected
  );

  test.each(["http://[::1]/", "http://[::]/", "http://[fe80::1]/", "http://[fc00::1]/", "http://[fd12:3456::1]/"])(
    "loopback, unspecified, link-local and unique-local IPv6: %s",
    rejected
  );

  test.each(["http://[::ffff:7f00:1]/", "http://[::ffff:a9fe:a9fe]/"])("IPv4-mapped IPv6 of loopback and metadata: %s", rejected);

  test.each([
    "http://127.0.0.1.nip.io/",
    "http://metadata.attacker.example/",
    "http://v6-loopback.attacker.example/",
    "http://v6-mapped.attacker.example/",
  ])("a public-looking name that resolves internally: %s", rejected);

  test("one internal address among several is enough to reject", () => rejected("http://mixed.attacker.example/"));

  test("credentials cannot smuggle the host: user:pass@127.0.0.1 is 127.0.0.1", () => rejected("http://user:pass@127.0.0.1/"));

  test("a name that does not resolve", () => rejected("http://does-not-exist.example/"));

  test("a name that resolves to nothing", () => rejected("http://empty.example/"));

  test("the reason names the internal address it found", async () => {
    const result = await validateExternalUrl("http://metadata.attacker.example/");
    expect(result).toMatchObject({ ok: false, resolvedAddress: "169.254.169.254" });
  });
});

describe("validateExternalUrl — gaps closed by F-003", () => {
  test.each(["http://[::ffff:a00:1]/", "http://[::ffff:c0a8:101]/"])(
    "IPv4-mapped IPv6 of a private range is rejected: %s",
    rejected
  );

  test("a name resolving to IPv4-mapped IPv6 in hex form is rejected", () => rejected("http://v6-mapped-hex.attacker.example/"));

  test("a name resolving to IPv4-mapped IPv6 of a private range is rejected", () =>
    rejected("http://v6-mapped-private.attacker.example/")
  );

  test("a name resolving to NAT64-mapped loopback is rejected", () => rejected("http://nat64.attacker.example/"));

  test.each(["http://240.0.0.1/", "http://255.255.255.255/"])("reserved and broadcast IPv4 are rejected: %s", rejected);

  test("a URL carrying credentials is rejected", () => rejected("http://user:secret@example.com/"));

  test.each([
    "http://[::127.0.0.1]/",
    "http://[2002:7f00:1::1]/",
    "http://[64:ff9b:1::1]/",
    "http://[2001:db8::1]/",
    "http://[2001::1]/",
    "http://[ff02::1]/",
    "http://[fec0::1]/",
    "http://[100::1]/",
    "http://192.0.2.1/",
    "http://198.51.100.1/",
    "http://203.0.113.1/",
  ])("IPv4-compatible, 6to4, local NAT64, documentation, Teredo, multicast, site-local, discard and TEST-NET: %s", rejected);

  test("an IPv6 literal is judged directly, without a DNS lookup", async () => {
    await rejected("http://[::ffff:a00:1]/");
    await allowed("http://[2606:4700::1111]/");
    expect(lookup).not.toHaveBeenCalled();
  });

  test("NAT64 of a public address stays allowed", () => allowed("http://[64:ff9b::808:808]/"));
});

describe("validateExternalUrl — the addresses it validated, for pinning the connection", () => {
  test("a name: every address it resolved to", async () => {
    await expect(validateExternalUrl("https://www.bbc.com/news")).resolves.toEqual({
      ok: true,
      addresses: [
        { address: "151.101.0.81", family: 4 },
        { address: "2a04:4e42::81", family: 6 },
      ],
    });
  });

  test("a literal: the literal itself, without brackets", async () => {
    await expect(validateExternalUrl("http://8.8.8.8/")).resolves.toEqual({ ok: true, addresses: [{ address: "8.8.8.8", family: 4 }] });
    await expect(validateExternalUrl("http://[2606:4700::1111]/")).resolves.toEqual({
      ok: true,
      addresses: [{ address: "2606:4700::1111", family: 6 }],
    });
  });
});

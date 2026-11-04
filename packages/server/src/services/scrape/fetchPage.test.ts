/**
 * @jest-environment node
 *
 * fetchPage with the real axios and a real local HTTP server (F-003). The
 * route's tests model axios; these prove the two things only real axios can:
 * `maxRedirects: 0` hands back the 3xx response, and the `lookup` hook pins
 * the connection. The guard is mocked so that names which exist in no DNS
 * ("pinned.example", "hop.example") validate to the local server's address:
 * a request that reaches the server can only have used the pinned address.
 */

jest.mock("@timesprime/shared/lib/urlValidation", () => ({ validateExternalUrl: jest.fn() }));

import http from "http";
import type { AddressInfo } from "net";
import { fetchPage, MAX_REDIRECTS, UnsafeTargetError } from "./fetchPage";

const { validateExternalUrl } = jest.requireMock("@timesprime/shared/lib/urlValidation") as { validateExternalUrl: jest.Mock };

let server: http.Server;
let port: number;
let hits: string[];
let routes: Record<string, (res: http.ServerResponse) => void>;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    hits.push(`${req.headers.host}${req.url}`);
    (routes[req.url ?? ""] ?? ((r) => r.writeHead(404).end()))(res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  hits = [];
  routes = {};
  validateExternalUrl.mockReset();
  validateExternalUrl.mockImplementation(async (url: string) => {
    const host = new URL(url).hostname;
    if (host === "pinned.example" || host === "hop.example") return { ok: true, addresses: [{ address: "127.0.0.1", family: 4 }] };
    return { ok: false, reason: "Target resolves to a private/internal address." };
  });
});

const page = (res: http.ServerResponse) => res.writeHead(200, { "content-type": "text/html" }).end("<p>article</p>");
const redirect = (location: string) => (res: http.ServerResponse) => res.writeHead(302, { location }).end();
const options = { timeoutMs: 2000, headers: { "User-Agent": "test" } };

test("the connection goes to the validated address, for a name no DNS knows", async () => {
  routes["/story"] = page;
  const result = await fetchPage(`http://pinned.example:${port}/story`, options);
  expect(result).toEqual({ url: `http://pinned.example:${port}/story`, data: "<p>article</p>" });
  expect(hits).toEqual([`pinned.example:${port}/story`]);
});

test("a redirect is handed back by axios and followed by fetchPage, through the guard", async () => {
  routes["/start"] = redirect(`http://hop.example:${port}/story`);
  routes["/story"] = page;
  const result = await fetchPage(`http://pinned.example:${port}/start`, options);
  expect(result.url).toBe(`http://hop.example:${port}/story`);
  expect(hits).toEqual([`pinned.example:${port}/start`, `hop.example:${port}/story`]);
  expect(validateExternalUrl).toHaveBeenCalledTimes(2);
});

test("a redirect the guard refuses is never requested", async () => {
  routes["/start"] = redirect(`http://internal.example:${port}/secret`);
  routes["/secret"] = page;
  await expect(fetchPage(`http://pinned.example:${port}/start`, options)).rejects.toBeInstanceOf(UnsafeTargetError);
  expect(hits).toEqual([`pinned.example:${port}/start`]);
});

test("a response over 5 MB is refused (F-010), one within it is read", async () => {
  routes["/huge"] = (res) => res.writeHead(200, { "content-type": "text/html" }).end("x".repeat(5 * 1024 * 1024 + 1));
  routes["/large"] = (res) => res.writeHead(200, { "content-type": "text/html" }).end("x".repeat(5 * 1024 * 1024));
  await expect(fetchPage(`http://pinned.example:${port}/huge`, options)).rejects.toThrow(/maxContentLength/);
  await expect(fetchPage(`http://pinned.example:${port}/large`, options)).resolves.toMatchObject({ url: `http://pinned.example:${port}/large` });
});

test(`more than ${MAX_REDIRECTS} redirects is refused`, async () => {
  routes["/loop"] = redirect(`http://pinned.example:${port}/loop`);
  await expect(fetchPage(`http://pinned.example:${port}/loop`, options)).rejects.toThrow(/more than 5 redirects/);
  expect(hits).toHaveLength(MAX_REDIRECTS + 1);
});

import "server-only";

/**
 * The ID an audit row carries to tie it to the request in the logs (R1-05, E-03):
 * - CloudFront's X-Amz-Cf-Id for the reader site, which CloudFront's access and WAF logs carry too;
 * - else Nginx's X-Request-Id (its $request_id, also in Nginx's access log) for the back office,
 *   which admin.timesprime247.com reaches without CloudFront;
 * - else a random UUID (local runs, a request that skipped Nginx).
 *
 * Both headers are trusted only because Nginx sets them (deploy/nginx): on the admin host it
 * clears X-Amz-Cf-Id, which a client could otherwise send to plant a false ID in the audit log, and
 * on both hosts it overwrites X-Request-Id. The ALB's X-Amzn-Trace-Id and Vercel's x-vercel-id
 * are no longer read: neither is in front of the app.
 */
export function getRequestId(request: Request): string {
  return request.headers.get("x-amz-cf-id") || request.headers.get("x-request-id") || crypto.randomUUID();
}

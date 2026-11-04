import "server-only";

/**
 * The ID an audit row carries to tie it to the request in the AWS logs (R1-05): CloudFront's
 * X-Amz-Cf-Id, which its access logs and WAF logs carry too; else the ALB's X-Amzn-Trace-Id,
 * which its access logs carry; else a random UUID (local runs, a request that skipped a hop).
 * It used to read Vercel's x-vercel-id, which AWS never sends, so every row got a UUID that no
 * log could be matched with.
 */
export function getRequestId(request: Request): string {
  return request.headers.get("x-amz-cf-id") || request.headers.get("x-amzn-trace-id") || crypto.randomUUID();
}

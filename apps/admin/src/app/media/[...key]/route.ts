import "server-only";

import { localMediaResponse } from "@timesprime/server/lib/mediaStorage";

// The Desk's images on a laptop (Panel 2, M4): files from the local media folder. On the server
// CloudFront serves /media/* from the S3 bucket, and this answers 404 (lib/mediaStorage.ts).
export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  return localMediaResponse(key);
}

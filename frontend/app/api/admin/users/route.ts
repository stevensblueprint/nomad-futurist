import { buildUsersEndpoint } from "../../../admin/users/adminUsers";

const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_UPSTREAM_BYTES = 64 * 1024;

const BEARER_PATTERN = /^Bearer\s+\S+$/;

function json(data: unknown, status: number): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function readLimited(
  stream: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<ArrayBuffer | null> {
  if (!stream) return new ArrayBuffer(0);

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
}

export async function POST(request: Request): Promise<Response> {
  const authorization = request.headers.get("Authorization");
  if (!authorization || !BEARER_PATTERN.test(authorization)) {
    return json({ message: "Session expired. Sign in again." }, 401);
  }

  const contentType = request.headers.get("Content-Type");
  const mediaType = contentType?.split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    return json({ message: "Content-Type must be application/json." }, 415);
  }

  const endpoint = buildUsersEndpoint(
    process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL,
  );
  if (!endpoint) {
    return json({ message: "API configuration is missing." }, 500);
  }

  const contentLength = request.headers.get("Content-Length");
  if (contentLength !== null) {
    const length = Number(contentLength);
    if (Number.isFinite(length) && length > MAX_REQUEST_BYTES) {
      return json({ message: "Request body is too large." }, 413);
    }
  }

  const requestBuffer = await readLimited(request.body, MAX_REQUEST_BYTES);
  if (requestBuffer === null) {
    return json({ message: "Request body is too large." }, 413);
  }

  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: requestBuffer,
      redirect: "manual",
      signal: AbortSignal.any([AbortSignal.timeout(10_000), request.signal]),
    });
  } catch {
    return json({ message: "Unable to reach the server." }, 502);
  }

  if (
    upstream.status === 204 ||
    upstream.status === 205 ||
    upstream.status === 304
  ) {
    return new Response(null, {
      status: upstream.status,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    return json({ message: "Unable to reach the server." }, 502);
  }

  let upstreamBuffer: ArrayBuffer;
  try {
    const result = await readLimited(upstream.body, MAX_UPSTREAM_BYTES);
    if (result === null) {
      return json({ message: "Unable to reach the server." }, 502);
    }
    upstreamBuffer = result;
  } catch {
    return json({ message: "Unable to reach the server." }, 502);
  }

  let message: string | undefined;
  try {
    const parsed: unknown = JSON.parse(
      new TextDecoder().decode(upstreamBuffer),
    );
    if (parsed !== null && typeof parsed === "object") {
      const candidate = (parsed as { message?: unknown }).message;
      if (typeof candidate === "string") {
        message = candidate;
      }
    }
  } catch {
    // Non-JSON or empty upstream body -> no message.
  }

  if (upstream.status >= 500) {
    message = undefined;
  }

  return Response.json(message ? { message } : {}, {
    status: upstream.status,
    headers: { "Cache-Control": "no-store" },
  });
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const fetchMock = vi.fn();

function textStream(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (bytes.byteLength > 0) controller.enqueue(bytes);
      controller.close();
    },
  });
}

function chunkedStream(
  totalBytes: number,
  chunkBytes = 1024,
): ReadableStream<Uint8Array> {
  let produced = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (produced >= totalBytes) {
        controller.close();
        return;
      }
      const size = Math.min(chunkBytes, totalBytes - produced);
      produced += size;
      controller.enqueue(new Uint8Array(size));
    },
  });
}

function upstreamResponse(status: number, body: string | null = ""): Response {
  return {
    status,
    body: body === null ? null : textStream(body),
  } as unknown as Response;
}

function makeRequest(headers: Record<string, string>, body = "{}"): Request {
  return new Request("http://localhost/api/admin/users", {
    method: "POST",
    headers,
    body,
  });
}

const validHeaders = {
  Authorization: "Bearer id-token",
  "Content-Type": "application/json",
};

describe("POST /api/admin/users", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("API_BASE_URL", "https://api.example.com/dev/");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("forwards the request and returns the upstream 201 response", async () => {
    fetchMock.mockResolvedValue(
      upstreamResponse(201, '{"message":"User invitation sent."}'),
    );

    const response = await POST(
      makeRequest(
        validHeaders,
        '{"email":"staff@example.com","role":"TechnicalStaff"}',
      ),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.com/dev/admin/users");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual(validHeaders);
    expect(init.redirect).toBe("manual");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(new TextDecoder().decode(init.body)).toBe(
      '{"email":"staff@example.com","role":"TechnicalStaff"}',
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ message: "User invitation sent." });
  });

  it("returns 401 when Authorization is missing", async () => {
    const response = await POST(makeRequest({ "Content-Type": "application/json" }));

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      message: "Session expired. Sign in again.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 401 when Authorization is not a Bearer token", async () => {
    const response = await POST(
      makeRequest({ Authorization: "Basic abc123", "Content-Type": "application/json" }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      message: "Session expired. Sign in again.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 500 when API_BASE_URL is missing", async () => {
    vi.stubEnv("API_BASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");

    const response = await POST(makeRequest(validHeaders));

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      message: "API configuration is missing.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 415 when Content-Type is not JSON", async () => {
    const response = await POST(
      makeRequest({ Authorization: "Bearer id-token", "Content-Type": "text/plain" }),
    );

    expect(response.status).toBe(415);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      message: "Content-Type must be application/json.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 413 when the request body is too large", async () => {
    const response = await POST(makeRequest(validHeaders, "x".repeat(17 * 1024)));

    expect(response.status).toBe(413);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      message: "Request body is too large.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the upstream 409 message with its status", async () => {
    fetchMock.mockResolvedValue(
      upstreamResponse(409, '{"message":"An account already exists for this email."}'),
    );

    const response = await POST(makeRequest(validHeaders));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      message: "An account already exists for this email.",
    });
  });

  it("returns {} for a non-JSON upstream body", async () => {
    fetchMock.mockResolvedValue(upstreamResponse(500, "<html>not json</html>"));

    const response = await POST(makeRequest(validHeaders));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({});
  });

  it("returns 502 for an upstream redirect", async () => {
    fetchMock.mockResolvedValue(upstreamResponse(302, null));

    const response = await POST(makeRequest(validHeaders));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      message: "Unable to reach the server.",
    });
  });

  it("returns an empty 204 response for a 204 upstream", async () => {
    fetchMock.mockResolvedValue(upstreamResponse(204, null));

    const response = await POST(makeRequest(validHeaders));

    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("");
  });

  it("returns an empty 205 response for a 205 upstream", async () => {
    fetchMock.mockResolvedValue(upstreamResponse(205, null));

    const response = await POST(makeRequest(validHeaders));

    expect(response.status).toBe(205);
    expect(await response.text()).toBe("");
  });

  it("returns an empty 304 response for a 304 upstream", async () => {
    fetchMock.mockResolvedValue(upstreamResponse(304, null));

    const response = await POST(makeRequest(validHeaders));

    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
  });

  it("rejects a Content-Type of application/jsonfoo", async () => {
    const response = await POST(
      makeRequest({
        Authorization: "Bearer id-token",
        "Content-Type": "application/jsonfoo",
      }),
    );

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({
      message: "Content-Type must be application/json.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts Content-Type parameters and forwards application/json", async () => {
    fetchMock.mockResolvedValue(
      upstreamResponse(201, '{"message":"User invitation sent."}'),
    );

    const response = await POST(
      makeRequest({
        Authorization: "Bearer id-token",
        "Content-Type": "application/json; charset=utf-8",
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.com/dev/admin/users");
    expect(init.headers).toEqual({
      Authorization: "Bearer id-token",
      "Content-Type": "application/json",
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ message: "User invitation sent." });
  });

  it("returns 502 when the upstream request rejects", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));

    const response = await POST(makeRequest(validHeaders));

    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      message: "Unable to reach the server.",
    });
  });

  it("returns 502 when the upstream body is too large", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      body: chunkedStream(64 * 1024 + 1),
    } as unknown as Response);

    const response = await POST(makeRequest(validHeaders));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      message: "Unable to reach the server.",
    });
  });

  it("returns 413 for an oversized Content-Length header", async () => {
    const request = new Request("http://localhost/api/admin/users", {
      method: "POST",
      headers: {
        Authorization: "Bearer id-token",
        "Content-Type": "application/json",
        "Content-Length": "20000",
      },
      body: "{}",
    });

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      message: "Request body is too large.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 415 when Content-Type is missing", async () => {
    const request = new Request("http://localhost/api/admin/users", {
      method: "POST",
      headers: { Authorization: "Bearer id-token" },
    });

    const response = await POST(request);

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({
      message: "Content-Type must be application/json.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reduces a 400 upstream response to its message", async () => {
    fetchMock.mockResolvedValue(
      upstreamResponse(400, '{"message":"bad","token":"secret"}'),
    );

    const response = await POST(makeRequest(validHeaders));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "bad" });
  });

  it("suppresses the message for a 500 upstream response", async () => {
    fetchMock.mockResolvedValue(
      upstreamResponse(500, '{"message":"internal detail","secret":"x"}'),
    );

    const response = await POST(makeRequest(validHeaders));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({});
  });

  it("returns 502 when fetch rejects with an AbortError", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    fetchMock.mockRejectedValue(abortError);

    const response = await POST(makeRequest(validHeaders));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      message: "Unable to reach the server.",
    });
  });

  it("returns 413 when the request stream exceeds the limit", async () => {
    // A real ReadableStream body is required to exercise the streaming
    // size limit (the Content-Length fast path does not cover streams).
    const request = new Request("http://localhost/api/admin/users", {
      method: "POST",
      headers: {
        Authorization: "Bearer id-token",
        "Content-Type": "application/json",
      },
      body: chunkedStream(17 * 1024),
      // `duplex` is required by undici for streaming bodies but is absent
      // from TypeScript's RequestInit type, so cast through unknown.
      duplex: "half",
    } as unknown as RequestInit);

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      message: "Request body is too large.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 502 when the upstream stream errors", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    fetchMock.mockResolvedValue({
      status: 200,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(abortError);
        },
      }),
    } as unknown as Response);

    const response = await POST(makeRequest(validHeaders));

    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      message: "Unable to reach the server.",
    });
  });

  it("falls back to NEXT_PUBLIC_API_BASE_URL when API_BASE_URL is empty", async () => {
    vi.stubEnv("API_BASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://fallback.example.com/dev/");
    fetchMock.mockResolvedValue(upstreamResponse(201, '{"message":"ok"}'));

    const response = await POST(makeRequest(validHeaders));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://fallback.example.com/dev/admin/users",
      expect.objectContaining({ method: "POST" }),
    );
    expect(response.status).toBe(201);
  });

  it("prefers API_BASE_URL when both variables are set", async () => {
    vi.stubEnv("API_BASE_URL", "https://primary.example.com/dev/");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://fallback.example.com/dev/");
    fetchMock.mockResolvedValue(upstreamResponse(201, '{"message":"ok"}'));

    const response = await POST(makeRequest(validHeaders));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://primary.example.com/dev/admin/users",
      expect.objectContaining({ method: "POST" }),
    );
    expect(response.status).toBe(201);
  });
});

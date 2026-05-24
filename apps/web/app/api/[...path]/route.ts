import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METHODS_WITH_BODY = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function buildTargetUrl(baseUrl: string, path: string[], search: string) {
  return `${trimTrailingSlash(baseUrl)}/${path.join("/")}${search}`;
}

async function forward(
  request: NextRequest,
  baseUrl: string,
  path: string[],
  timeoutMs: number
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const targetUrl = buildTargetUrl(baseUrl, path, request.nextUrl.search);
    const headers = new Headers(request.headers);
    headers.delete("host");

    const init: RequestInit = {
      method: request.method,
      headers,
      signal: controller.signal,
      redirect: "manual"
    };

    if (METHODS_WITH_BODY.has(request.method)) {
      init.body = await request.arrayBuffer();
    }

    const response = await fetch(targetUrl, init);
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function shouldFallback(response: Response) {
  return response.status >= 500;
}

function responseWithHeaders(response: Response, servedBy: string) {
  const headers = new Headers(response.headers);
  headers.set("x-genfren-api-target", servedBy);
  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

let lastPrimaryFailureAt = 0;

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const primaryUrl = process.env.PRIMARY_API_URL;
  const fallbackUrl = process.env.FALLBACK_API_URL;
  const timeoutMs = Number(process.env.API_FAILOVER_TIMEOUT_MS ?? 4000);
  const cooldownMs = Number(process.env.API_FAILOVER_COOLDOWN_MS ?? 30000);

  if (!primaryUrl) {
    return NextResponse.json(
      { error: "Hosted backend unavailable. The app will continue in local vault mode where supported." },
      { status: 503, headers: { "x-genfren-api-target": "unavailable" } }
    );
  }

  const now = Date.now();
  const useFallbackFirst = !!fallbackUrl && now - lastPrimaryFailureAt < cooldownMs;
  const targets = useFallbackFirst
    ? [
        { name: "fallback", url: fallbackUrl },
        { name: "primary", url: primaryUrl }
      ]
    : [
        { name: "primary", url: primaryUrl },
        { name: "fallback", url: fallbackUrl }
      ];

  let lastError: unknown;

  for (const target of targets) {
    if (!target.url) continue;
    try {
      const response = await forward(request, target.url, path, timeoutMs);
      if (target.name === "primary" && shouldFallback(response) && fallbackUrl) {
        lastPrimaryFailureAt = Date.now();
        continue;
      }
      if (target.name === "primary") {
        lastPrimaryFailureAt = 0;
      }
      return responseWithHeaders(response, target.name);
    } catch (error) {
      lastError = error;
      if (target.name === "primary" && fallbackUrl) {
        lastPrimaryFailureAt = Date.now();
        continue;
      }
    }
  }

  return NextResponse.json(
    { error: "Hosted backend unavailable. The app will continue in local vault mode where supported." },
    { status: 503, headers: { "x-genfren-api-target": "unavailable" } }
  );
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;

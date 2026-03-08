const API_PROXY_TARGET = process.env.API_PROXY_TARGET || "http://127.0.0.1:5000";

function buildTargetUrl(pathParts: string[], requestUrl: string): string {
  const incoming = new URL(requestUrl);
  const base = API_PROXY_TARGET.endsWith("/") ? API_PROXY_TARGET : `${API_PROXY_TARGET}/`;
  const target = new URL(pathParts.join("/"), base);
  target.search = incoming.search;
  return target.toString();
}

async function proxyRequest(request: Request, pathParts: string[]): Promise<Response> {
  const targetUrl = buildTargetUrl(pathParts, request.url);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const bodyBuffer = hasBody ? await request.arrayBuffer() : undefined;

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
    body: bodyBuffer,
  };

  try {
    const upstream = await fetch(targetUrl, init);
    const passthroughHeaders = new Headers(upstream.headers);
    passthroughHeaders.set("x-proxy-upstream-url", targetUrl);

    return new Response(upstream.body, {
      status: upstream.status,
      headers: passthroughHeaders,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown proxy error";
    return Response.json(
      {
        error_code: "UPSTREAM_UNREACHABLE",
        message: `Proxy could not reach API target ${API_PROXY_TARGET}`,
        detail,
        attempted_url: targetUrl,
      },
      { status: 502 },
    );
  }
}

type RouteContext = { params: Promise<{ path: string[] }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function POST(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function PUT(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function DELETE(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function OPTIONS(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}


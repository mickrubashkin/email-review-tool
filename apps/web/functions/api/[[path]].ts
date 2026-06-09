const defaultBackendOrigin = "https://email-review-tool-production.up.railway.app";

export async function onRequest(context: PagesFunctionContext) {
  let requestURL: URL;
  let targetURL: URL;

  try {
    requestURL = new URL(context.request.url);
    targetURL = new URL(
      requestURL.pathname + requestURL.search,
      normalizeBackendOrigin(context.env.BACKEND_ORIGIN),
    );
    if (targetURL.host === requestURL.host) {
      throw new Error("BACKEND_ORIGIN must point to the API origin, not this Pages domain");
    }
  } catch (error) {
    return new Response(formatProxyError(error), {
      headers: { "content-type": "text/plain; charset=utf-8" },
      status: 502,
    });
  }

  const headers = new Headers(context.request.headers);
  headers.delete("host");
  headers.set("x-forwarded-host", requestURL.host);
  headers.set("x-forwarded-proto", requestURL.protocol.replace(":", ""));

  const init: RequestInit = {
    headers,
    method: context.request.method,
    redirect: "manual",
  };

  if (!["GET", "HEAD"].includes(context.request.method.toUpperCase())) {
    init.body = context.request.body;
  }

  try {
    return await fetch(targetURL, init);
  } catch (error) {
    return new Response(formatProxyError(error), {
      headers: { "content-type": "text/plain; charset=utf-8" },
      status: 502,
    });
  }
}

function normalizeBackendOrigin(value: string | undefined) {
  const origin = (value ?? defaultBackendOrigin).trim().replace(/^['"]|['"]$/g, "");
  return new URL(origin).origin;
}

function formatProxyError(error: unknown) {
  if (error instanceof Error) {
    return `Cloudflare proxy configuration error: ${error.message}`;
  }
  return "Cloudflare proxy configuration error";
}

type Env = {
  BACKEND_ORIGIN?: string;
};

type PagesFunctionContext = {
  env: Env;
  request: Request;
};

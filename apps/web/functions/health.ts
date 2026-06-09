const defaultBackendOrigin = "https://email-review-tool-production.up.railway.app";

export async function onRequest(context: PagesFunctionContext) {
  let targetURL: URL;

  try {
    targetURL = new URL("/health", normalizeBackendOrigin(context.env.BACKEND_ORIGIN));
  } catch (error) {
    return new Response(formatProxyError(error), {
      headers: { "content-type": "text/plain; charset=utf-8" },
      status: 502,
    });
  }

  const headers = new Headers(context.request.headers);
  headers.delete("host");

  try {
    return await fetch(targetURL, {
      headers,
      method: context.request.method,
      redirect: "manual",
    });
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

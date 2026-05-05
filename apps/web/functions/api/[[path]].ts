const defaultBackendOrigin = "https://email-review-tool-production.up.railway.app";

export async function onRequest(context: PagesFunctionContext) {
  const backendOrigin = context.env.BACKEND_ORIGIN ?? defaultBackendOrigin;
  const requestURL = new URL(context.request.url);
  const targetURL = new URL(requestURL.pathname + requestURL.search, backendOrigin);

  const headers = new Headers(context.request.headers);
  headers.delete("host");
  headers.set("x-forwarded-host", requestURL.host);
  headers.set("x-forwarded-proto", requestURL.protocol.replace(":", ""));

  return fetch(targetURL, {
    body: context.request.body,
    headers,
    method: context.request.method,
    redirect: "manual",
  });
}

type Env = {
  BACKEND_ORIGIN?: string;
};

type PagesFunctionContext = {
  env: Env;
  request: Request;
};

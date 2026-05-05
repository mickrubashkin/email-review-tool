const defaultBackendOrigin = "https://email-review-tool-production.up.railway.app";

export async function onRequest(context: PagesFunctionContext) {
  const backendOrigin = context.env.BACKEND_ORIGIN ?? defaultBackendOrigin;
  const targetURL = new URL("/health", backendOrigin);

  return fetch(targetURL, {
    headers: context.request.headers,
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

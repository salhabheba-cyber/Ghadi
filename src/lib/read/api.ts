/** Thin client for /api/app. Errors carry the server's plain-language message and a stable code. */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiFailure";
  }
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/app/${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiFailure(0, "offline", "offline");
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiFailure(res.status, err?.code ?? "error", err?.message ?? `Error ${res.status}`);
  }
  return data as T;
}
export const get = <T = unknown>(p: string) => api<T>("GET", p);
export const post = <T = unknown>(p: string, b: unknown = {}) => api<T>("POST", p, b);
export const put = <T = unknown>(p: string, b: unknown = {}) => api<T>("PUT", p, b);
export const patch = <T = unknown>(p: string, b: unknown = {}) => api<T>("PATCH", p, b);
export const del = <T = unknown>(p: string) => api<T>("DELETE", p);

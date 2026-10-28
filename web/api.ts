let dataGeneration: string | undefined;

export function apiUrl(path: string) {
  return new URL(`./api/${path}`, document.baseURI).toString();
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
      ...(dataGeneration ? { "X-Casa-Generation": dataGeneration } : {}),
    },
    credentials: "same-origin",
  });
  if (!response.ok) {
    if (response.status === 401)
      window.dispatchEvent(new Event("auth-required"));
    const error = await response
      .json()
      .catch(() => ({ message: `Errore ${response.status}` }));
    throw new Error(error.message ?? `Errore ${response.status}`);
  }
  const data: unknown = await response.json();
  if (
    path === "bootstrap" &&
    data &&
    typeof data === "object" &&
    "generation" in data &&
    typeof data.generation === "string"
  )
    dataGeneration = data.generation;
  return data as T;
}

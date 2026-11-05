export async function api(path: string, data?: unknown, method?: string) {
  const response = await fetch(path, {
    method: method ?? (data === undefined ? "GET" : "POST"),
    headers:
      data instanceof FormData ? {} : { "content-type": "application/json" },
    body:
      data === undefined
        ? undefined
        : data instanceof FormData
          ? data
          : JSON.stringify(data),
  });
  if (response.status === 401) {
    location.href = "/login";
    throw Error("Login required");
  }
  if (!response.ok) {
    const value = await response.json().catch(() => ({}));
    throw Error(value.error?.message ?? "Request failed");
  }
  return response.status === 204 ? undefined : response.json();
}

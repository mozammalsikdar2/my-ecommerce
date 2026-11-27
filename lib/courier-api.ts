import { isRecord } from "@/lib/api-utils";

export class CourierProviderError extends Error {}

export async function requestCourierJson(
  url: string,
  init: RequestInit,
  timeoutMs = 10_000,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new CourierProviderError();

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new CourierProviderError();
    }
    if (!isRecord(data)) throw new CourierProviderError();
    return data;
  } catch (error) {
    if (error instanceof CourierProviderError) throw error;
    throw new CourierProviderError();
  } finally {
    clearTimeout(timeout);
  }
}

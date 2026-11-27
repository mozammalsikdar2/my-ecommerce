import { getBkashApiBaseUrl } from "@/lib/payment-config";
import { encryptPaymentSecret } from "@/lib/payment-secrets";
import { prisma } from "@/lib/prisma";

export interface BkashCredentials {
  sandbox: boolean;
  appKey: string;
  appSecret: string;
  username: string;
  password: string;
  accessToken: string;
  tokenExpiresAt: Date | null;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

async function readProviderResponse(response: Response) {
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error("bKash returned an invalid response");
  }
  if (!isRecord(result)) {
    throw new Error("bKash returned an invalid response");
  }
  if (
    !response.ok ||
    (typeof result.statusCode === "string" && result.statusCode !== "0000")
  ) {
    throw new Error(
      `bKash request failed (${response.status}${
        typeof result.statusCode === "string" ? `, ${result.statusCode}` : ""
      })`,
    );
  }
  return result;
}

let tokenRefresh: Promise<string> | null = null;

export async function getBkashAccessToken(credentials: BkashCredentials) {
  if (
    credentials.accessToken &&
    credentials.tokenExpiresAt &&
    credentials.tokenExpiresAt.getTime() > Date.now() + 60_000
  ) {
    return credentials.accessToken;
  }
  if (tokenRefresh) return tokenRefresh;

  tokenRefresh = (async () => {
    const response = await fetch(
      `${getBkashApiBaseUrl(credentials.sandbox)}/tokenized-checkout/auth/grant-token`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          username: credentials.username,
          password: credentials.password,
        },
        body: JSON.stringify({
          app_key: credentials.appKey,
          app_secret: credentials.appSecret,
        }),
        cache: "no-store",
      },
    );
    const result = await readProviderResponse(response);
    if (
      typeof result.id_token !== "string" ||
      typeof result.expires_in !== "number" ||
      !Number.isFinite(result.expires_in) ||
      result.expires_in <= 0
    ) {
      throw new Error("bKash token response is missing token expiry data");
    }

    const expiresAt = new Date(Date.now() + result.expires_in * 1000);
    await prisma.paymentSettings.update({
      where: { id: 1 },
      data: {
        bkashAccessToken: encryptPaymentSecret(result.id_token),
        bkashTokenExpiresAt: expiresAt,
      },
    });
    return result.id_token;
  })();

  try {
    return await tokenRefresh;
  } finally {
    tokenRefresh = null;
  }
}

export async function bkashRequest(
  credentials: BkashCredentials,
  path: string,
  body: JsonRecord,
) {
  const token = await getBkashAccessToken(credentials);
  const response = await fetch(
    `${getBkashApiBaseUrl(credentials.sandbox)}/${path}`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        authorization: token,
        "x-app-key": credentials.appKey,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  return readProviderResponse(response);
}

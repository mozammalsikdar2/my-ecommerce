import {
  decryptPaymentSecret,
  isPaymentEncryptionConfigured,
} from "@/lib/payment-secrets";
import { prisma } from "@/lib/prisma";

async function loadSettings() {
  return prisma.paymentSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
}

type PaymentSettingsRecord = Awaited<ReturnType<typeof loadSettings>>;

export function getStoredBkashCredentials(settings: PaymentSettingsRecord) {
  if (
    settings.bkashAppKey &&
    settings.bkashAppSecret &&
    settings.bkashUsername &&
    settings.bkashPassword
  ) {
    return {
      sandbox: settings.bkashSandbox,
      appKey: decryptPaymentSecret(settings.bkashAppKey),
      appSecret: decryptPaymentSecret(settings.bkashAppSecret),
      username: decryptPaymentSecret(settings.bkashUsername),
      password: decryptPaymentSecret(settings.bkashPassword),
      accessToken: settings.bkashAccessToken
        ? decryptPaymentSecret(settings.bkashAccessToken)
        : "",
      tokenExpiresAt: settings.bkashTokenExpiresAt,
    };
  }
  return null;
}

export function getStoredStripeCredentials(settings: PaymentSettingsRecord) {
  if (settings.stripePublishableKey && settings.stripeSecretKey) {
    return {
      publishableKey: settings.stripePublishableKey,
      secretKey: decryptPaymentSecret(settings.stripeSecretKey),
      currency: settings.stripeCurrency.toLowerCase(),
    };
  }
  return null;
}

export async function getPaymentConfig() {
  const settings = await loadSettings();
  const encryptionConfigured = isPaymentEncryptionConfigured();
  const bkash = settings.bkashEnabled && encryptionConfigured
    ? getStoredBkashCredentials(settings)
    : null;
  const stripe = settings.stripeEnabled && encryptionConfigured
    ? getStoredStripeCredentials(settings)
    : null;
  return { settings, bkash, stripe };
}

export function getBkashApiBaseUrl(sandbox: boolean) {
  return sandbox
    ? "https://tokenized.sandbox.bka.sh/v1.2.0-beta"
    : "https://tokenized.pay.bka.sh/v1.2.0-beta";
}

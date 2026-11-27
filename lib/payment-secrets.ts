import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

function getEncryptionKey() {
  const encodedKey = process.env.PAYMENT_CREDENTIALS_ENCRYPTION_KEY;
  if (!encodedKey) {
    throw new Error("PAYMENT_CREDENTIALS_ENCRYPTION_KEY is not configured");
  }
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encodedKey)) {
    throw new Error(
      "PAYMENT_CREDENTIALS_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
    );
  }

  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) {
    throw new Error(
      "PAYMENT_CREDENTIALS_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
    );
  }
  return key;
}

export function isPaymentEncryptionConfigured() {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptPaymentSecret(value: string) {
  if (!value) return "";

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptPaymentSecret(value: string) {
  if (!value) return "";

  const [version, encodedIv, encodedTag, encodedCiphertext, extra] =
    value.split(".");
  if (
    version !== "v1" ||
    !encodedIv ||
    !encodedTag ||
    !encodedCiphertext ||
    extra !== undefined
  ) {
    throw new Error("Stored payment credential has an unsupported format");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(encodedIv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

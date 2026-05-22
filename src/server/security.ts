import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { getConfig } from "./config";

const ALGORITHM = "aes-256-gcm";

function getViewKeyEncryptionKey() {
  const raw = getConfig().VIEW_KEY_ENCRYPTION_KEY;
  if (!raw) {
    if (getConfig().MONERO_WALLET_MODE === "mock") {
      return Buffer.alloc(32, 0);
    }
    throw new Error("VIEW_KEY_ENCRYPTION_KEY is required for view-only stores");
  }

  const key =
    raw.length === 64 && /^[0-9a-f]+$/i.test(raw)
      ? Buffer.from(raw, "hex")
      : Buffer.from(raw, "base64");

  if (key.length !== 32) {
    throw new Error("VIEW_KEY_ENCRYPTION_KEY must decode to 32 bytes");
  }
  return key;
}

export function encryptPrivateViewKey(privateViewKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getViewKeyEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(privateViewKey, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptPrivateViewKey(encryptedPrivateViewKey: string) {
  const [version, iv, tag, ciphertext] = encryptedPrivateViewKey.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) {
    throw new Error("Unsupported encrypted view key payload");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    getViewKeyEncryptionKey(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function redactSecret(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

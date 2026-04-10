import type { SupportedAlgorithm, TotpResult } from "../types";
import { decodeBase32 } from "./base32";

function algorithmToHmacName(algorithm: SupportedAlgorithm): string {
  switch (algorithm) {
    case "SHA1":
      return "SHA-1";
    case "SHA256":
      return "SHA-256";
    case "SHA512":
      return "SHA-512";
    default:
      return "SHA-1";
  }
}

function counterToBuffer(counter: number): ArrayBuffer {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);

  const high = Math.floor(counter / 2 ** 32);
  const low = counter >>> 0;

  view.setUint32(0, high, false);
  view.setUint32(4, low, false);

  return buffer;
}

async function hmacDigest(
  secretBytes: Uint8Array,
  counter: number,
  algorithm: SupportedAlgorithm
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    secretBytes as any,  // <--- 修改这里，绕过类型检查
    {
      name: "HMAC",
      hash: { name: algorithmToHmacName(algorithm) }
    },
    false,
    ["sign"]
  );

  const digest = await crypto.subtle.sign("HMAC", cryptoKey, counterToBuffer(counter));
  return new Uint8Array(digest);
}

function truncateToOtp(hmac: Uint8Array, digits: number): string {
  const offset = hmac[hmac.length - 1] & 0x0f;

  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 10 ** digits;
  return otp.toString().padStart(digits, "0");
}

export async function generateTotp(params: {
  secret: string;
  digits: number;
  period: number;
  algorithm: SupportedAlgorithm;
  timestamp?: number;
}): Promise<TotpResult> {
  const {
    secret,
    digits,
    period,
    algorithm,
    timestamp = Date.now()
  } = params;

  if (digits < 6 || digits > 8) {
    throw new Error("digits 只支持 6 到 8。");
  }

  if (period <= 0) {
    throw new Error("period 必须大于 0。");
  }

  const secretBytes = decodeBase32(secret);
  const unixSeconds = Math.floor(timestamp / 1000);
  const counter = Math.floor(unixSeconds / period);
  const remainingSeconds = period - (unixSeconds % period);

  const hmac = await hmacDigest(secretBytes, counter, algorithm);
  const code = truncateToOtp(hmac, digits);

  return {
    code,
    counter,
    remainingSeconds
  };
}

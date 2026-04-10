import type { ParsedOtpAuth, SupportedAlgorithm } from "../types";
import { normalizeBase32 } from "./base32";

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseAlgorithm(value: string | null): SupportedAlgorithm {
  const normalized = (value ?? "SHA1").toUpperCase();

  if (normalized === "SHA1" || normalized === "SHA256" || normalized === "SHA512") {
    return normalized;
  }

  return "SHA1";
}

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

export function parseOtpAuthUri(uri: string): ParsedOtpAuth {
  const raw = uri.trim();

  if (!raw.startsWith("otpauth://")) {
    throw new Error("不是合法的 otpauth:// 链接。");
  }

  const url = new URL(raw);

  if (url.protocol !== "otpauth:") {
    throw new Error("otpauth 协议无效。");
  }

  if (url.hostname.toLowerCase() !== "totp") {
    throw new Error("当前只支持 otpauth://totp/...");
  }

  const label = safeDecodeURIComponent(url.pathname.replace(/^\//, ""));
  const issuerFromQuery = safeDecodeURIComponent(url.searchParams.get("issuer") ?? "");
  const secret = normalizeBase32(url.searchParams.get("secret") ?? "");

  if (!secret) {
    throw new Error("otpauth 链接里缺少 secret 参数。");
  }

  let issuer = issuerFromQuery;
  let account = label;

  if (label.includes(":")) {
    const [left, ...rest] = label.split(":");
    const possibleIssuer = left.trim();
    const possibleAccount = rest.join(":").trim();

    if (!issuer && possibleIssuer) {
      issuer = possibleIssuer;
    }

    account = possibleAccount || label;
  }

  const digits = parsePositiveInt(url.searchParams.get("digits"), 6);
  const period = parsePositiveInt(url.searchParams.get("period"), 30);
  const algorithm = parseAlgorithm(url.searchParams.get("algorithm"));

  return {
    secret,
    issuer,
    account,
    digits,
    period,
    algorithm
  };
}

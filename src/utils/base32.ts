const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function normalizeBase32(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, "")
    .replace(/=+$/g, "")
    .toUpperCase();
}

export function isValidBase32(input: string): boolean {
  const normalized = normalizeBase32(input);
  if (!normalized) return false;
  return /^[A-Z2-7]+$/.test(normalized);
}

export function decodeBase32(input: string): Uint8Array {
  const normalized = normalizeBase32(input);

  if (!normalized) {
    throw new Error("Secret 不能为空。");
  }

  if (!/^[A-Z2-7]+$/.test(normalized)) {
    throw new Error("Secret 不是合法的 Base32 格式。");
  }

  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error("Secret 包含非法 Base32 字符。");
    }

    value = (value << 5) | index;
    bits += 5;

    while (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return new Uint8Array(output);
}

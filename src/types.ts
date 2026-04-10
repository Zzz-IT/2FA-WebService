export type SupportedAlgorithm = "SHA1" | "SHA256" | "SHA512";

export interface ParsedOtpAuth {
  secret: string;
  issuer: string;
  account: string;
  digits: number;
  period: number;
  algorithm: SupportedAlgorithm;
}

export interface TotpResult {
  code: string;
  counter: number;
  remainingSeconds: number;
}

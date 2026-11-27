export interface BdPhoneValidationResult {
  valid: boolean;
  normalized?: string;
  operator?: string;
  error?: string;
}

const OPERATOR_PREFIXES: Record<string, string> = {
  "013": "Grameenphone",
  "014": "Banglalink",
  "015": "Teletalk",
  "016": "Airtel",
  "017": "Grameenphone",
  "018": "Robi",
  "019": "Banglalink",
};

const BLOCKED_DUMMY_NUMBERS = new Set([
  "01700000000",
  "01711111111",
  "01712345678",
  "01800000000",
  "01811111111",
  "01900000000",
  "01911111111",
  "01600000000",
  "01500000000",
]);

export function validateBangladeshiPhone(
  rawInput: string,
): BdPhoneValidationResult {
  if (typeof rawInput !== "string" || !rawInput.trim()) {
    return { valid: false, error: "Mobile number is required." };
  }

  const cleaned = rawInput.replace(/[\s\-().]/g, "");
  const match = cleaned.match(/^(?:\+?88)?(01[3-9]\d{8})$/);
  if (!match) {
    return {
      valid: false,
      error:
        "Please enter a valid 11-digit Bangladeshi mobile number (e.g., 017XXXXXXXX).",
    };
  }

  const normalized = match[1];
  const subscriberDigits = normalized.slice(3);
  if (
    /^(\d)\1{7}$/.test(subscriberDigits) ||
    BLOCKED_DUMMY_NUMBERS.has(normalized)
  ) {
    return {
      valid: false,
      error: "Please enter a real, active Bangladeshi mobile number.",
    };
  }

  const operator = OPERATOR_PREFIXES[normalized.slice(0, 3)];
  if (!operator) {
    return { valid: false, error: "Unsupported mobile operator prefix." };
  }

  return { valid: true, normalized, operator };
}

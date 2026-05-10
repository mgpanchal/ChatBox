type DlpRule = {
  id: string;
  label: string;
  pattern: RegExp;
  test?: (matched: string) => boolean;
};

function luhnValid(s: string): boolean {
  const digits = s.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = +digits[i]!;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

const RULES: DlpRule[] = [
  {
    id: 'card_number',
    label: 'Possible card number',
    pattern: /\b(?:\d[ -]?){13,19}\b/g,
    test: (m) => luhnValid(m),
  },
  {
    id: 'aadhaar',
    label: 'Possible Aadhaar number',
    pattern: /\b\d{4}\s?\d{4}\s?\d{4}\b/g,
    test: (m) => /^\d{4}\s?\d{4}\s?\d{4}$/.test(m.trim()),
  },
  {
    id: 'pan',
    label: 'Possible PAN',
    pattern: /\b[A-Z]{5}\d{4}[A-Z]\b/g,
  },
  {
    id: 'ifsc',
    label: 'Possible IFSC code',
    pattern: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g,
  },
  {
    id: 'email',
    label: 'Email address',
    pattern: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
  },
  {
    id: 'iban',
    label: 'Possible bank account / IBAN',
    pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g,
  },
  {
    id: 'private_key_block',
    label: 'Cryptographic private key',
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PRIVATE )+KEY-----/g,
  },
];

export type DlpHit = { id: string; label: string };

export function scanForDlp(body: string): DlpHit[] {
  const hits: DlpHit[] = [];
  const seen = new Set<string>();
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.pattern.exec(body)) !== null) {
      if (rule.test && !rule.test(m[0])) continue;
      if (seen.has(rule.id)) break;
      seen.add(rule.id);
      hits.push({ id: rule.id, label: rule.label });
      break;
    }
  }
  return hits;
}

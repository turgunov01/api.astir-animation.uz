// A .p8 key pasted from a terminal or a chat often picks up junk: escaped
// "\n", spaces, or zsh's "%" end-of-line marker. Rebuild a clean PEM from
// the base64 body so such a paste still works.
export function normalizePrivateKeyPem(value) {
  const text = String(value || "").replace(/\\n/g, "\n");
  if (!/-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----/.test(text)) return text;
  const body = text
    .replace(/[\s\S]*-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----[\s\S]*/, "")
    .replace(/[^A-Za-z0-9+/=]/g, "");
  return `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g)?.join("\n") || ""}\n-----END PRIVATE KEY-----\n`;
}

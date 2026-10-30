/** 默认密码与最常见的弱口令；命中即视为必须更换。 */
const COMMON_PASSWORDS = new Set([
  "admin123456", "admin123", "administrator", "password", "password1",
  "password123", "12345678", "123456789", "1234567890", "11111111",
  "00000000", "66666666", "88888888", "qwerty123", "qwertyuiop",
  "1q2w3e4r", "1qaz2wsx", "abc12345", "a123456789", "iloveyou",
]);

export const MIN_PASSWORD_LENGTH = 10;
/** bcrypt 只使用前 72 字节，更长的部分不会参与校验。 */
const MAX_PASSWORD_BYTES = 72;

/** 返回不合格原因；合格时返回 null。 */
export function passwordProblem(password: string, username: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `新密码至少需要 ${MIN_PASSWORD_LENGTH} 位`;
  }
  if (Buffer.byteLength(password) > MAX_PASSWORD_BYTES) {
    return "新密码过长（最多 72 字节）";
  }
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower) || (username && lower.includes(username.toLowerCase()))) {
    return "密码过于常见或包含用户名，请换一个更难猜的密码";
  }
  if (new Set(password).size < 5) return "密码字符种类太少，请混用字母、数字或符号";
  return null;
}

/**
 * 数据库备份加密：设置 BACKUP_PASSPHRASE 后，npm run backup 输出 .db.gz.enc。
 * 备份通常会同步到异地/对象存储，加密后即使备份泄露也看不到数据（含管理员密码哈希、会话等）。
 *
 * 文件格式：头部 "TSBK" + 版本(1) + scrypt log2(N)(1) + salt(16) + iv(12)，随后是 gzip 数据的
 * AES-256-GCM 密文，最后 16 字节是认证标签。头部作为附加认证数据，改动任何一个字节都会解密失败。
 * 流式处理，备份再大也不会整个读进内存。
 */
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "node:crypto";
import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";

const MAGIC = Buffer.from("TSBK");
const VERSION = 1;
/** scrypt N = 2^16：约 64 MB 内存、零点几秒，拖慢暴力猜口令。 */
const LOG_N = 16;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const HEADER_LENGTH = MAGIC.length + 2 + SALT_LENGTH + IV_LENGTH;

export const MIN_PASSPHRASE_LENGTH = 12;

/** 口令不合格时返回错误文案。 @param {string} passphrase */
export function passphraseProblem(passphrase) {
  return passphrase.length < MIN_PASSPHRASE_LENGTH
    ? `BACKUP_PASSPHRASE 至少需要 ${MIN_PASSPHRASE_LENGTH} 个字符`
    : null;
}

/** @param {string} passphrase @param {Buffer} salt @param {number} logN @returns {Promise<Buffer>} */
function deriveKey(passphrase, salt, logN) {
  const N = 2 ** logN;
  return new Promise((resolve, reject) =>
    scrypt(passphrase, salt, 32, { N, r: 8, p: 1, maxmem: 256 * N * 8 }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

/**
 * 返回一个可放进 stream.pipeline 的加密转换（异步生成器函数）。
 * @param {string} passphrase
 */
export async function encryptStream(passphrase) {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const header = Buffer.concat([MAGIC, Buffer.from([VERSION, LOG_N]), salt, iv]);
  const cipher = createCipheriv("aes-256-gcm", await deriveKey(passphrase, salt, LOG_N), iv);
  cipher.setAAD(header);
  /** @param {AsyncIterable<Buffer>} source */
  return async function* encrypt(source) {
    yield header;
    for await (const chunk of source) yield cipher.update(chunk);
    yield cipher.final();
    yield cipher.getAuthTag();
  };
}

/** 文件是否是加密备份（看文件头，不看扩展名）。 @param {string} file */
export async function isEncryptedBackup(file) {
  const handle = await open(file);
  try {
    const head = Buffer.alloc(MAGIC.length);
    await handle.read(head, 0, MAGIC.length, 0);
    return head.equals(MAGIC);
  } finally {
    await handle.close();
  }
}

/**
 * 打开加密备份：返回密文读取流和解密转换，交给 pipeline 串上 gunzip。
 * 口令错误或文件被改动时，解密在流结束处抛出错误（GCM 认证失败）。
 * @param {string} file
 * @param {string} passphrase
 */
export async function openEncryptedBackup(file, passphrase) {
  const handle = await open(file);
  let header;
  let tag;
  let size;
  try {
    size = (await handle.stat()).size;
    if (size <= HEADER_LENGTH + TAG_LENGTH) throw new Error("文件太小，不是完整的加密备份");
    header = Buffer.alloc(HEADER_LENGTH);
    await handle.read(header, 0, HEADER_LENGTH, 0);
    tag = Buffer.alloc(TAG_LENGTH);
    await handle.read(tag, 0, TAG_LENGTH, size - TAG_LENGTH);
  } finally {
    await handle.close();
  }
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("不是加密备份文件");
  if (header[MAGIC.length] !== VERSION) throw new Error(`不支持的备份格式版本：${header[MAGIC.length]}`);
  const logN = header[MAGIC.length + 1];
  if (logN < 10 || logN > 22) throw new Error("备份文件头已损坏");
  const salt = header.subarray(MAGIC.length + 2, MAGIC.length + 2 + SALT_LENGTH);
  const iv = header.subarray(MAGIC.length + 2 + SALT_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", await deriveKey(passphrase, salt, logN), iv);
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  return {
    source: createReadStream(file, { start: HEADER_LENGTH, end: size - TAG_LENGTH - 1 }),
    decipher,
  };
}

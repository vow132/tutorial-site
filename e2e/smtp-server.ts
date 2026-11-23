import net from "node:net";

export type ReceivedMail = { from: string; to: string[]; data: string; subject: string; text: string; headers: string };

/**
 * 测试用的极简 SMTP 服务器：只认 EHLO/HELO、MAIL FROM、RCPT TO、DATA、RSET、NOOP、QUIT，
 * 不支持加密和登录（测试里发信设置不勾 SSL、不填用户名）。收到的邮件放在 mails 里。
 */
export async function startSmtpServer() {
  const mails: ReceivedMail[] = [];
  const server = net.createServer((socket) => {
    socket.setEncoding("utf8");
    let buffer = "";
    let inData = false;
    let current: { from: string; to: string[]; data: string } = { from: "", to: [], data: "" };
    const reply = (line: string) => socket.write(`${line}\r\n`);
    reply("220 test-smtp ready");
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      for (;;) {
        if (inData) {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end === -1) return;
          current.data = buffer.slice(0, end).replace(/^\.\./gm, ".");
          buffer = buffer.slice(end + 5);
          inData = false;
          mails.push({ ...current, ...parse(current.data) });
          current = { from: "", to: [], data: "" };
          reply("250 OK queued");
          continue;
        }
        const newline = buffer.indexOf("\r\n");
        if (newline === -1) return;
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 2);
        const command = line.slice(0, 4).toUpperCase();
        if (command === "EHLO") socket.write("250-test-smtp\r\n250-8BITMIME\r\n250 SMTPUTF8\r\n");
        else if (command === "HELO") reply("250 test-smtp");
        else if (command === "MAIL") {
          current.from = line.replace(/^MAIL FROM:\s*/i, "");
          reply("250 OK");
        } else if (command === "RCPT") {
          current.to.push(line.replace(/^RCPT TO:\s*<?([^>\s]+)>?.*$/i, "$1"));
          reply("250 OK");
        } else if (command === "DATA") {
          inData = true;
          reply("354 End data with <CR><LF>.<CR><LF>");
        } else if (command === "QUIT") {
          reply("221 Bye");
          socket.end();
        } else reply("250 OK");
      }
    });
    socket.on("error", () => undefined);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as net.AddressInfo).port;
  return {
    port,
    mails,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** 解码 quoted-printable / base64 正文（只够测试用）。 */
function decodePart(body: string, encoding: string) {
  if (/base64/i.test(encoding)) return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
  if (/quoted-printable/i.test(encoding)) {
    const bytes = body.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    return Buffer.from(bytes, "latin1").toString("utf8");
  }
  return body;
}

function decodeHeader(value: string) {
  // 相邻的编码词之间的空白不算内容
  return value.replace(/\?=\s+=\?/g, "?==?").replace(/=\?utf-8\?([BQ])\?([^?]*)\?=/gi, (_, kind: string, text: string) =>
    kind.toUpperCase() === "B"
      ? Buffer.from(text, "base64").toString("utf8")
      : Buffer.from(text.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (__, hex: string) => String.fromCharCode(parseInt(hex, 16))), "latin1").toString("utf8"),
  );
}

function parse(raw: string) {
  const headerEnd = raw.indexOf("\r\n\r\n");
  const headers = raw.slice(0, headerEnd).replace(/\r\n[ \t]+/g, " ");
  const subject = decodeHeader(/^Subject: (.*)$/im.exec(headers)?.[1] ?? "").replace(/\s{2,}/g, " ");
  // 取 text/plain 部分
  const plain = /Content-Type: text\/plain[^\r\n]*\r\n(?:Content-Transfer-Encoding: ([^\r\n]+)\r\n)?\r\n([\s\S]*?)\r\n--/i.exec(raw);
  const text = plain ? decodePart(plain[2], plain[1] ?? "") : "";
  return { subject, text, headers };
}

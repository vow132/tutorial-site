/** 相机、截图、聊天软件、剪贴板粘贴等自动生成的文件名前缀：这类名字对读者毫无意义。 */
const MEANINGLESS_PREFIX =
  /^(img|image|dsc|dscn|dcim|pxl|photo|pic|screenshot|screen shot|snipaste|mmexport|wx|untitled|微信图片|屏幕截图|截屏|截图|未命名|图片)(?=[\s\d(（]|$)/i;

/**
 * 由上传的文件名推断图片说明（alt）：去掉扩展名，连字符/下划线换成空格。
 * 无意义的名字（IMG_1234、image.png、时间戳、哈希）返回空串，留给作者手动填写。
 */
export function altFromFileName(fileName: string): string {
  const base = fileName
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (
    !base ||
    MEANINGLESS_PREFIX.test(base) ||
    /^[\d\s.:()（）]+$/.test(base) ||
    /^[0-9a-f\s]{8,}$/i.test(base)
  ) {
    return "";
  }
  return base.slice(0, 120);
}

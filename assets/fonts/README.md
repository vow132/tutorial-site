# 分享图字体

`NotoSansSC-Bold-subset.ttf`：思源黑体（Noto Sans SC）Bold 的子集，供文章分享图（`lib/share-image-render.tsx`）
在服务端绘制标题使用，许可证见 `OFL.txt`（SIL Open Font License 1.1）。

只保留了 ASCII、GB2312 全部字符（6763 个常用汉字和全角符号）与常见中文标点，约 2.2 MB。
分享图只会绘制字体里有的字符，其余字符（emoji、生僻字）会被略去，保证渲染时不访问外网。

重新生成（需要 Python 的 fonttools）：

```bash
python3 - <<'PY' > chars.txt
chars = {chr(c) for c in range(0x20, 0x7f)}
for hi in range(0xA1, 0xF8):
    for lo in range(0xA1, 0xFF):
        try:
            chars.add(bytes([hi, lo]).decode("gb2312"))
        except UnicodeDecodeError:
            pass
chars.update("“”‘’—–…·•《》「」『』【】〔〕、。，；：？！（）～￥％＋－×÷°℃№→←↑↓©®™")
print("".join(sorted(chars)), end="")
PY
pyftsubset NotoSansSC-Bold.ttf --text-file=chars.txt --no-hinting \
  --layout-features='kern,palt,halt,vert' --output-file=NotoSansSC-Bold-subset.ttf
```

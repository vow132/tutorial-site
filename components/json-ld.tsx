/**
 * 结构化数据（schema.org）。type 不是 JS，CSP 不会拦，浏览器也不会执行。
 * 把 `<` 换成 Unicode 转义，防止内容里的 `</script>` 提前闭合标签（Next 官方 JSON-LD 指南的做法）。
 */
export default function JsonLd({ data }: { data: object }) {
  const json = JSON.stringify({ "@context": "https://schema.org", ...data });
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json.replace(/</g, "\\u003c") }}
    />
  );
}

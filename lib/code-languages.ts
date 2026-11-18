/**
 * 代码块语言：编辑器的下拉选项和文章页代码块左上角的标签共用。
 * 键是 highlight.js 的语言名（lib/article.ts 里都已注册），值是显示名。
 */
export const CODE_LANGUAGES: Record<string, string> = {
  bash: "Shell", c: "C", cpp: "C++", csharp: "C#", css: "CSS", dart: "Dart",
  dockerfile: "Dockerfile", go: "Go", graphql: "GraphQL", http: "HTTP", ini: "INI",
  java: "Java", javascript: "JavaScript", json: "JSON", kotlin: "Kotlin", less: "Less",
  markdown: "Markdown", nginx: "Nginx", objectivec: "Objective-C", php: "PHP",
  plaintext: "纯文本", powershell: "PowerShell", python: "Python", ruby: "Ruby", rust: "Rust",
  scss: "SCSS", sql: "SQL", swift: "Swift", typescript: "TypeScript", xml: "HTML", yaml: "YAML",
};

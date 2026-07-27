/**
 * 提示词模板文件类型声明
 *
 * esbuild 在打包时将 .md 文件作为文本字符串加载，此处声明使 TypeScript
 * 允许 import template from "*.md" 语法。
 */
declare module "*.md" {
  const content: string;
  export default content;
}

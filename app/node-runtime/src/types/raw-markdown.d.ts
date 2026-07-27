/**
 * 类型声明：让 TypeScript 识别 *.md?raw 导入（Vite 原生支持）。
 */
declare module "*.md?raw" {
  const content: string;
  export default content;
}

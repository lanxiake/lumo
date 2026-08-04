import { describe, it, expect } from "vitest";
import {
  extractBodyFragment,
  extractHtmlBlock,
  validatePlaygroundContent,
  wrapPlaygroundHtml,
  checkPlaygroundHtmlSafety,
} from "../src/tools/playground-html.js";

describe("extractHtmlBlock（thinking 兜底：HTML 埋在设计散文里）", () => {
  it("```html``` 围栏 → 取围栏内", () => {
    expect(extractHtmlBlock("说明\n```html\n<div id=g></div><script>go()</script>\n```\n结束")).toBe(
      "<div id=g></div><script>go()</script>",
    );
  });

  it("无围栏：前有散文、后有散文 → 只切出 HTML 区段", () => {
    const raw = "我打算这样做游戏：\n<style>.a{}</style><canvas></canvas><script>draw()</script>\n上面这个蝴蝶朝向有个 bug，后续再优化。";
    const out = extractHtmlBlock(raw);
    expect(out.startsWith("<style>")).toBe(true);
    expect(out.endsWith("</script>")).toBe(true);
    expect(out).not.toContain("bug");
    expect(out).not.toContain("我打算");
  });

  it("纯 HTML（正常路径）→ 原样", () => {
    const html = "<div></div><script>x()</script>";
    expect(extractHtmlBlock(html)).toBe(html);
  });
});

describe("extractBodyFragment", () => {
  it("完整文档 → 抽出 body 内容 + head 内联样式", () => {
    const doc = `<!doctype html><html><head><style>.a{color:red}</style></head>` +
      `<body><div id="g">hi</div><script>go()</script></body></html>`;
    const frag = extractBodyFragment(doc);
    expect(frag).toContain(".a{color:red}");
    expect(frag).toContain('<div id="g">hi</div>');
    expect(frag).toContain("go()");
    // 不得残留顶层文档标签
    expect(frag).not.toMatch(/<(!doctype|html|head|body)\b/i);
  });

  it("片段 → 原样返回", () => {
    const frag = `<div onclick="x()">tap</div>`;
    expect(extractBodyFragment(frag)).toBe(frag);
  });
});

describe("wrapPlaygroundHtml（回归：模型返回完整文档不再嵌套导致空白）", () => {
  it("包装完整文档后，最终 HTML 里只有一个 <body>", () => {
    const doc = `<!doctype html><html><head><style>.p{}</style></head>` +
      `<body><canvas id="c"></canvas><script>draw()</script></body></html>`;
    const wrapped = wrapPlaygroundHtml(doc);
    expect((wrapped.match(/<body/gi) ?? []).length).toBe(1);
    expect((wrapped.match(/<!doctype/gi) ?? []).length).toBe(1);
    // 游戏实体仍在
    expect(wrapped).toContain('<canvas id="c">');
    expect(wrapped).toContain("draw()");
    expect(wrapped).toContain(".p{}");
  });
});

describe("validatePlaygroundContent", () => {
  it("空 / 过短 → 无效", () => {
    expect(validatePlaygroundContent("").valid).toBe(false);
    expect(validatePlaygroundContent("<p>ok</p>").valid).toBe(false);
  });

  it("纯文字解释 → 无效", () => {
    expect(validatePlaygroundContent("好的，我来帮你做一个警察抓小偷的游戏，稍等一下哦，马上就好啦。").valid).toBe(false);
  });

  it("有结构无交互（静态半成品）→ 无效", () => {
    const html = `<div class="scene"><img src="data:x"><p>${"街道".repeat(20)}</p></div>`;
    expect(validatePlaygroundContent(html).valid).toBe(false);
  });

  it("含 script 的完整游戏 → 有效", () => {
    const html = `<div id="game"></div><script>${"const s=1;".repeat(10)}</script>`;
    expect(validatePlaygroundContent(html).valid).toBe(true);
  });

  it("含 inline handler 的游戏 → 有效", () => {
    const html = `<button onclick="catchThief()" style="width:200px">${"抓小偷".repeat(10)}</button>`;
    expect(validatePlaygroundContent(html).valid).toBe(true);
  });
});

describe("safety 与 content 互补", () => {
  it("空壳能过 safety 但被 content 拦", () => {
    const shell = "我这就去做啦";
    expect(checkPlaygroundHtmlSafety(shell).safe).toBe(true);
    expect(validatePlaygroundContent(shell).valid).toBe(false);
  });
});

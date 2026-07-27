import { parseDataUri } from "./mediaStore";

describe("parseDataUri", () => {
  it("解析标准 png data URI", () => {
    const r = parseDataUri("data:image/png;base64,iVBORw0KGgo=");
    expect(r).toEqual({ mimeType: "image/png", base64: "iVBORw0KGgo=" });
  });

  it("解析 jpeg / webp", () => {
    expect(parseDataUri("data:image/jpeg;base64,/9j/4AAQ")?.mimeType).toBe("image/jpeg");
    expect(parseDataUri("data:image/webp;base64,UklGRg")?.mimeType).toBe("image/webp");
  });

  it("去除首尾空白", () => {
    const r = parseDataUri("  data:image/png;base64,AAAA  ");
    expect(r?.base64).toBe("AAAA");
  });

  it("非 data URI 返回 null", () => {
    expect(parseDataUri("https://example.com/a.png")).toBeNull();
    expect(parseDataUri("file:///tmp/a.png")).toBeNull();
    expect(parseDataUri("")).toBeNull();
  });

  it("非图片 MIME 返回 null", () => {
    expect(parseDataUri("data:text/plain;base64,aGVsbG8=")).toBeNull();
  });

  it("缺少 base64 数据返回 null", () => {
    expect(parseDataUri("data:image/png;base64,")).toBeNull();
  });

  it("非 base64 编码（无 ;base64）返回 null", () => {
    expect(parseDataUri("data:image/png,rawtext")).toBeNull();
  });
});

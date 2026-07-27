/**
 * Jest setup — 为 RN 单元测试提供通用 mock
 *
 * react-native-webview 在 Jest 环境下没有 native module，需要 mock。
 */

jest.mock("react-native-webview", () => {
  const React = require("react");
  const { View } = require("react-native");

  function MockWebView(props, ref) {
    return React.createElement(View, { ref, testID: "webview-mock", ...props });
  }

  return {
    __esModule: true,
    default: React.forwardRef(MockWebView),
    WebView: React.forwardRef(MockWebView),
  };
});

jest.mock("react-native-fs", () => {
  const store = {};

  const path = (p) => String(p);
  const read = (p) => store[path(p)] ?? "";
  const write = (p, data) => {
    store[path(p)] = String(data);
  };

  const api = {
    DocumentDirectoryPath: "/mock/documents",
    mkdir: jest.fn(async (p) => {
      store[path(p)] = store[path(p)] ?? "";
    }),
    exists: jest.fn(async (p) => path(p) in store),
    readFile: jest.fn(async (p) => read(p)),
    writeFile: jest.fn(async (p, data) => write(p, data)),
    moveFile: jest.fn(async (src, dst) => {
      const s = path(src);
      const d = path(dst);
      store[d] = store[s] ?? "";
      delete store[s];
    }),
    appendFile: jest.fn(async (p, data) => {
      const key = path(p);
      store[key] = (store[key] ?? "") + String(data);
    }),
    __reset: () => {
      Object.keys(store).forEach((k) => delete store[k]);
    },
    __store: () => store,
  };

  return {
    __esModule: true,
    default: api,
    ...api,
  };
});

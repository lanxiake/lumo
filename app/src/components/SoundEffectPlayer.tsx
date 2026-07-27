/**
 * SoundEffectPlayer — 基于隐藏 WebView 的音效播放器
 *
 * 与 AudioPlayerView 思路一致：利用已有的 react-native-webview，
 * 在隐藏 WebView 内通过 HTML5 Audio 播放短音效。音效文件从本地 assets 加载。
 *
 * MVP 支持的音效：success / encourage / tick / pop / complete / error。
 */

import React, { useCallback, useImperativeHandle, useRef, forwardRef } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import type { SoundName } from "../hooks/useAppActions";

export interface SoundEffectPlayerHandle {
  /** 播放一个短音效 */
  play(sound: SoundName, volume?: number): void;
}

/**
 * 音效资源映射。
 * TODO：将真实 mp3 文件放入 android/app/src/main/res/raw/ 与 ios 资源目录后，
 * 把下面路径替换为平台真实路径（如 file:///android_asset/audio/success.mp3）。
 * MVP 先用 base64 空音频占位，保证事件链路不崩溃。
 */
const SOUND_URLS: Record<SoundName, string> = {
  success: "data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
  encourage: "data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
  tick: "data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
  pop: "data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
  complete: "data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
  error: "data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
  call_start: "data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
  call_end: "data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
};

const SOUND_PLAYER_HTML = `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/></head>
<body style="margin:0;background:transparent">
<script>
(function(){
  var audio = null;
  function play(url, volume){
    try{
      if(audio){ audio.pause(); }
      audio = new Audio(url);
      audio.volume = typeof volume === "number" ? volume : 0.8;
      audio.play().catch(function(){});
    }catch(e){}
  }
  function handle(raw){
    var msg; try{ msg = JSON.parse(raw); }catch(e){ return; }
    if(msg.cmd === "play") play(msg.url, msg.volume);
  }
  window.addEventListener("message", function(e){ handle(e.data); });
  document.addEventListener("message", function(e){ handle(e.data); });
})();
true;
</script></body></html>`;

export const SoundEffectPlayer = forwardRef<SoundEffectPlayerHandle>(
  function SoundEffectPlayer(_props, ref) {
    const webviewRef = useRef<WebView>(null);

    const send = useCallback((obj: Record<string, unknown>) => {
      const json = JSON.stringify(obj);
      webviewRef.current?.injectJavaScript(
        `(function(){try{window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(json)}}));}catch(e){}})();true;`,
      );
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        play: (sound: SoundName, volume = 0.8) => {
          const url = SOUND_URLS[sound];
          if (!url) return;
          // MVP：当前使用 base64 空音频占位，真实音效资源需在 P1 前补齐。
          // 详见文件顶部 TODO。
          console.log(`[SoundEffectPlayer] 播放占位音效: ${sound}`);
          send({ cmd: "play", url, volume });
        },
      }),
      [send],
    );

    return (
      <View style={styles.hidden} pointerEvents="none">
        <WebView
          ref={webviewRef}
          source={{ html: SOUND_PLAYER_HTML }}
          originWhitelist={["about:"]}
          javaScriptEnabled
          mediaPlaybackRequiresUserAction={false}
          style={styles.hidden}
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  hidden: { width: 0, height: 0, position: "absolute", left: -9999, top: -9999 },
});

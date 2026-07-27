/**
 * AudioPlayerView — 独立隐藏 WebView 音频播放器(TTS mp3 播放 + 音量分析)
 *
 * 裸 RN 无内置音频播放,但已有 react-native-webview。故用一个独立隐藏 WebView 内的
 * HTML5 Audio 播放 TTS 合成的 mp3(base64),并用 Web Audio AnalyserNode 实时分析音量,
 * postMessage 回传 RN 驱动宠物口型 + 状态机(speaking→idle)。
 *
 * 关键修复:Android WebView 中 AudioContext 可能被 suspend 或 destination 不出声,
 * 若把主 audio 接入 Web Audio graph 会"劫持"系统音频导致完全静音。
 * 因此把"播放音频"与"分析音频"分离:主 audio 直接播放保证出声,分析 audio 静音走 Web Audio;
 * Web Audio 不可用时降级为模拟口型。
 *
 * 优点:零新增 native 依赖(不装 react-native-sound 等);播放/音量都在 WebView 内,
 * 与 Live2D WebView 同栈。不污染 pet-core(用独立自定义消息,非 WebViewCommand)。
 */

import React, { useCallback, useEffect, useImperativeHandle, useRef, forwardRef } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

/** WebView → RN 的播放事件 */
export type AudioPlayerEvent =
  | { type: "ready" }
  | { type: "play_start" }
  | { type: "play_end" }
  | { type: "play_error"; message: string }
  | { type: "level"; value: number }; // 当前音量 0~1(驱动口型)

export interface AudioPlayerHandle {
  /** 播放一段 mp3(base64,不含 data URI 前缀) */
  play(audioBase64: string, mimeType?: string): void;
  /** 播放文字 TTS(Web Speech API,中文) */
  speak(text: string): void;
  /** 停止当前播放 */
  stop(): void;
}

export interface AudioPlayerViewProps {
  readonly onEvent?: (event: AudioPlayerEvent) => void;
}

/**
 * 内联播放器 HTML:收 {audioBase64,mimeType} 消息 → 播放 + AnalyserNode 采样音量。
 * 事件经 window.ReactNativeWebView.postMessage 回传 RN。
 *
 * 设计要点:
 *  - playbackAudio: 主播放音频,不接入 Web Audio,直接走系统音频,确保任何情况下都出声。
 *  - analyserAudio: 静音的第二条音频,接入 Web Audio AnalyserNode 用于口型,失败不影响播放。
 *  - Web Audio 初始化失败时,用定时器模拟音量曲线,保证宠物嘴型仍能动。
 */
const PLAYER_HTML = `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/></head>
<body style="margin:0;background:transparent">
<script>
(function(){
  var post = function(o){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(o)); }catch(e){} };
  var playbackAudio = null, analyserAudio = null, ctx = null, analyser = null, raf = 0, data = null, simTimer = 0;

  function stopAllAudio(){
    try{ if(playbackAudio){ playbackAudio.pause(); playbackAudio.onended = null; playbackAudio = null; } }catch(e){}
    try{ if(analyserAudio){ analyserAudio.pause(); analyserAudio.onended = null; analyserAudio = null; } }catch(e){}
  }

  function stopLevel(){
    if(raf){ cancelAnimationFrame(raf); raf = 0; }
    if(simTimer){ clearInterval(simTimer); simTimer = 0; }
  }

  function startSimulatedLevel(){
    stopLevel();
    simTimer = setInterval(function(){
      post({type:"level", value: 0.25 + Math.random() * 0.3});
    }, 120);
  }

  function tickLevel(){
    if(!analyser || !data) return;
    try{
      analyser.getByteTimeDomainData(data);
      var sum = 0;
      for(var i = 0; i < data.length; i++){
        var v = (data[i] - 128) / 128;
        sum += v * v;
      }
      var rms = Math.sqrt(sum / data.length);
      post({type:"level", value: Math.min(1, rms * 2.5)});
    }catch(e){}
    raf = requestAnimationFrame(tickLevel);
  }

  function play(base64, mime){
    try{
      stopLevel();
      stopAllAudio();
      var mimeType = mime || "audio/mp3";

      // 1. 主播放音频:直接播放,走系统音频,保证出声
      playbackAudio = new Audio("data:" + mimeType + ";base64," + base64);
      playbackAudio.onerror = function(){
        post({type:"play_error", message: "audio load error"});
      };
      playbackAudio.onended = function(){
        stopLevel();
        post({type:"level", value: 0});
        post({type:"play_end"});
      };

      // 2. 分析音频:静音 + Web Audio,用于驱动口型;失败则降级模拟
      var analyserReady = false;
      try{
        if(!ctx){ ctx = new (window.AudioContext || window.webkitAudioContext)(); }
        if(ctx.state === "suspended"){ ctx.resume(); }
        analyserAudio = new Audio("data:" + mimeType + ";base64," + base64);
        analyserAudio.muted = true;
        analyserAudio.volume = 0;
        var srcNode = ctx.createMediaElementSource(analyserAudio);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        data = new Uint8Array(analyser.fftSize);
        srcNode.connect(analyser);
        // 故意不连接 ctx.destination: analyserAudio 仅用于分析,不实际出声
        analyserAudio.play();
        raf = requestAnimationFrame(tickLevel);
        analyserReady = true;
      }catch(e){
        analyser = null;
        data = null;
      }

      if(!analyserReady){
        startSimulatedLevel();
      }

      // 3. 启动主音频
      var p = playbackAudio.play();
      post({type:"play_start"});
      if(p && p.catch){
        p.catch(function(err){ post({type:"play_error", message: String(err && err.message || err)}); });
      }
    }catch(e){
      post({type:"play_error", message: String(e && e.message || e)});
    }
  }

  function stop(){
    stopLevel();
    stopAllAudio();
    post({type:"level", value: 0});
  }

  function speak(text){
    try{
      stop();
      if(!window.speechSynthesis){
        post({type:"play_error", message: "当前设备不支持语音合成"});
        return;
      }
      var u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-CN";
      u.rate = 1.0;
      u.pitch = 1.1;
      var simTimerLocal = setInterval(function(){
        post({type:"level", value: 0.3 + Math.random() * 0.4});
      }, 120);
      u.onstart = function(){ post({type:"play_start"}); };
      u.onend = function(){
        clearInterval(simTimerLocal);
        post({type:"level", value: 0});
        post({type:"play_end"});
      };
      u.onerror = function(e){
        clearInterval(simTimerLocal);
        post({type:"play_error", message: e.error || "tts error"});
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    }catch(e){
      post({type:"play_error", message: String(e && e.message || e)});
    }
  }

  function handle(raw){
    var msg;
    try{ msg = JSON.parse(raw); }catch(e){ return; }
    if(msg.cmd === "play") play(msg.audioBase64, msg.mimeType);
    else if(msg.cmd === "speak") speak(msg.text);
    else if(msg.cmd === "stop") stop();
  }

  window.addEventListener("message", function(e){ handle(e.data); });
  document.addEventListener("message", function(e){ handle(e.data); }); // Android 兼容
  post({type:"ready"});
})();
true;
</script></body></html>`;

const PLAY_TIMEOUT_MS = 5000;

export const AudioPlayerView = forwardRef<AudioPlayerHandle, AudioPlayerViewProps>(
  function AudioPlayerView(props, ref) {
    const webviewRef = useRef<WebView>(null);
    const playTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onEventRef = useRef(props.onEvent);
    onEventRef.current = props.onEvent;

    const clearPlayTimeout = useCallback(() => {
      if (playTimeoutRef.current) {
        clearTimeout(playTimeoutRef.current);
        playTimeoutRef.current = null;
      }
    }, []);

    const emit = useCallback((event: AudioPlayerEvent) => {
      if (event.type === "play_start" || event.type === "play_error" || event.type === "play_end") {
        clearPlayTimeout();
      }
      onEventRef.current?.(event);
    }, [clearPlayTimeout]);

    const send = useCallback((obj: Record<string, unknown>) => {
      const json = JSON.stringify(obj);
      // 派发 message 事件给 WebView 内监听器(同 Live2DView 的注入方式)。
      webviewRef.current?.injectJavaScript(
        `(function(){try{window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(
          json,
        )}}));}catch(e){}})();true;`,
      );
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        play: (audioBase64: string, mimeType = "audio/mp3") => {
          clearPlayTimeout();
          send({ cmd: "play", audioBase64, mimeType });
          // WebView injectJavaScript 可能因 0 尺寸/WebView 暂停而丢失,
          // 加超时兜底避免前端一直卡在 speaking/tts_converting。
          playTimeoutRef.current = setTimeout(() => {
            console.warn("[AudioPlayerView] play timeout, emit play_error");
            emit({ type: "play_error", message: "播放指令未响应" });
          }, PLAY_TIMEOUT_MS);
        },
        speak: (text: string) => send({ cmd: "speak", text }),
        stop: () => {
          clearPlayTimeout();
          send({ cmd: "stop" });
        },
      }),
      [send, emit, clearPlayTimeout],
    );

    const handleMessage = useCallback(
      (event: WebViewMessageEvent) => {
        let parsed: AudioPlayerEvent | null = null;
        try {
          parsed = JSON.parse(event.nativeEvent.data) as AudioPlayerEvent;
        } catch {
          return;
        }
        if (parsed) emit(parsed);
      },
      [emit],
    );

    useEffect(() => {
      return () => clearPlayTimeout();
    }, [clearPlayTimeout]);

    return (
      <View style={styles.hidden} pointerEvents="none">
        <WebView
          ref={webviewRef}
          source={{ html: PLAYER_HTML }}
          onMessage={handleMessage}
          originWhitelist={["about:"]}
          javaScriptEnabled
          // 关键:允许无用户手势自动播放(TTS 由发送消息触发,属交互链内)
          mediaPlaybackRequiresUserAction={false}
          style={styles.hidden}
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  // 隐藏:0 尺寸 + 移出屏幕(仍需挂载以运行 JS/播放)
  hidden: { width: 0, height: 0, position: "absolute", left: -9999, top: -9999 },
});

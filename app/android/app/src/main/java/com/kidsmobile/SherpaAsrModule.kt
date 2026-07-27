package com.kidsmobile

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.k2fsa.sherpa.onnx.OnlineModelConfig
import com.k2fsa.sherpa.onnx.OnlineRecognizer
import com.k2fsa.sherpa.onnx.OnlineRecognizerConfig
import com.k2fsa.sherpa.onnx.OnlineStream
import com.k2fsa.sherpa.onnx.OnlineTransducerModelConfig
import com.k2fsa.sherpa.onnx.Vad
import com.k2fsa.sherpa.onnx.getEndpointConfig
import com.k2fsa.sherpa.onnx.getFeatureConfig
import com.k2fsa.sherpa.onnx.getVadModelConfig
import kotlin.concurrent.thread

/**
 * SherpaAsrModule — 基于 sherpa-onnx 的流式中文语音识别原生模块。
 *
 * 设计要点：
 * - OnlineRecognizer（type=0：bilingual zh-en zipformer 流式模型）出 partial/final，
 *   isEndpoint 定稿；比 Vosk 小模型精度更高。
 * - Vad（Silero）独立检测「用户开始说话」，发 onSpeechStart，供状态机 barge-in 长度门控。
 * - 事件名与既有 react-native-vosk 保持一致（onSpeechStart / onSpeechPartialResult /
 *   onSpeechResults / onSpeechEnd / onSpeechError），JS 侧适配器可零改动复用。
 *
 * 模型文件放 app/src/main/assets/：
 *   sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20/{encoder,decoder,joiner}-epoch-99-avg-1.onnx
 *   sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20/tokens.txt
 *   silero_vad.onnx
 */
class SherpaAsrModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "SherpaAsrModule"
        private const val SAMPLE_RATE = 16000
        private const val VAD_WINDOW = 512
        private const val VAD_MODEL_TYPE = 0 // Silero VAD

        /**
         * 采集源：运行期探测 AcousticEchoCanceler.isAvailable()。
         * AEC 可用 → VOICE_COMMUNICATION（触发平台 AEC/NS/AGC 预处理链，全双工必需）；
         * AEC 不可用 → MIC（原始音质，降级半双工）。
         * 在 start() 调用时评估，实例生命期内固定。
         */
        private fun audioSource(): Int {
            return if (AcousticEchoCanceler.isAvailable())
                MediaRecorder.AudioSource.VOICE_COMMUNICATION
            else
                MediaRecorder.AudioSource.MIC
        }

        /** bilingual zh-en 流式模型目录（assets 内） */
        private const val MODEL_DIR =
            "sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20"

        /**
         * 模型精度开关：
         * - false：float32 非量化（质量最高，encoder ~315MB，当前默认）
         * - true ：int8 量化（体积小 6 倍 ~54MB，质量接近，儿童机友好）
         *
         * 两套模型文件已同在 assets/$MODEL_DIR/ 下，切换无需重新下载/构建资源。
         */
        private const val USE_INT8_MODEL = true
    }

    /** 按精度开关构造 transducer 模型配置（encoder int8，decoder/joiner 官方也提供 int8） */
    private fun buildModelConfig(): OnlineModelConfig {
        val suffix = if (USE_INT8_MODEL) ".int8.onnx" else ".onnx"
        return OnlineModelConfig(
            transducer = OnlineTransducerModelConfig(
                encoder = "$MODEL_DIR/encoder-epoch-99-avg-1$suffix",
                decoder = "$MODEL_DIR/decoder-epoch-99-avg-1$suffix",
                joiner = "$MODEL_DIR/joiner-epoch-99-avg-1$suffix",
            ),
            tokens = "$MODEL_DIR/tokens.txt",
            modelType = "zipformer",
        )
    }

    override fun getName(): String = "SherpaAsr"

    @Volatile private var recognizer: OnlineRecognizer? = null
    @Volatile private var vad: Vad? = null

    @Volatile private var isRecording = false
    @Volatile private var usingVoiceComm = false
    private var audioRecord: AudioRecord? = null
    private var recordingThread: Thread? = null

    /** 初始化识别器与 VAD（幂等）。off 主线程调用，加载模型较重。 */
    @ReactMethod
    fun initialize(promise: Promise) {
        thread(isDaemon = true) {
            try {
                synchronized(this) {
                    if (recognizer == null) {
                        Log.i(TAG, "[initialize] 正在加载 sherpa-onnx 流式识别模型 int8=$USE_INT8_MODEL")
                        val config = OnlineRecognizerConfig(
                            featConfig = getFeatureConfig(sampleRate = SAMPLE_RATE, featureDim = 80),
                            modelConfig = buildModelConfig(),
                            endpointConfig = getEndpointConfig(),
                            enableEndpoint = true,
                        )
                        recognizer = OnlineRecognizer(
                            assetManager = reactContext.assets,
                            config = config,
                        )
                        Log.i(TAG, "[initialize] 识别器初始化完成")
                    }
                    if (vad == null) {
                        Log.i(TAG, "[initialize] 正在加载 Silero VAD type=$VAD_MODEL_TYPE")
                        vad = Vad(
                            assetManager = reactContext.assets,
                            config = getVadModelConfig(type = VAD_MODEL_TYPE)!!,
                        )
                        Log.i(TAG, "[initialize] VAD 初始化完成")
                    }
                }
                promise.resolve(true)
            } catch (e: Throwable) {
                Log.e(TAG, "[initialize] 模型加载失败: ${e.message}", e)
                promise.reject("init_failed", e)
            }
        }
    }

    /** 检查模型是否可用（已加载）。 */
    @ReactMethod
    fun isAvailable(promise: Promise) {
        promise.resolve(recognizer != null && vad != null)
    }

    /** 开始聆听：启动 AudioRecord 采集线程 + 流式解码循环。 */
    @ReactMethod
    fun start(promise: Promise) {
        try {
            if (isRecording) {
                Log.i(TAG, "[start] 已在聆听，忽略重复调用")
                promise.resolve(true)
                return
            }
            val rec = recognizer
            val v = vad
            if (rec == null || v == null) {
                emitError("model_not_loaded", "语音模型未加载")
                promise.reject("model_not_loaded", "语音模型未加载")
                return
            }
            if (ContextCompat.checkSelfPermission(
                    reactContext,
                    Manifest.permission.RECORD_AUDIO,
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                emitError("permissions", "缺少麦克风权限")
                promise.reject("permissions", "缺少麦克风权限")
                return
            }

            val minBytes = AudioRecord.getMinBufferSize(
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
            )
            val audioSrc = audioSource()
            val useVoiceComm = (audioSrc == MediaRecorder.AudioSource.VOICE_COMMUNICATION)
            val ar = AudioRecord(
                audioSrc,
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                minBytes * 2,
            )
            audioRecord = ar
            usingVoiceComm = useVoiceComm
            Log.i(TAG, "[start] AudioRecord source=$audioSrc sessionId=${ar.audioSessionId}")
            // 录音 session 附着 AEC（若可用）+ NS/AGC，降低嘈杂误打断。
            val attached = duplexModule()?.attachAecToSession(ar.audioSessionId) ?: false
            Log.i(TAG, "[start] AEC/NS/AGC 附着结果=$attached voiceComm=$useVoiceComm")
            v.reset()
            isRecording = true
            recordingThread = thread(isDaemon = true) { processLoop(rec, v) }
            Log.i(TAG, "[start] 已开始聆听")
            emit("onSpeechStart", Arguments.createMap())
            promise.resolve(true)
        } catch (e: Throwable) {
            Log.e(TAG, "[start] 启动失败: ${e.message}", e)
            isRecording = false
            emitError("start_failed", e.message ?: "unknown")
            promise.reject("start_failed", e)
        }
    }

    /** 停止聆听：结束采集线程并释放 AudioRecord。 */
    @ReactMethod
    fun stop(promise: Promise) {
        stopInternal()
        promise.resolve(true)
    }

    private fun stopInternal() {
        if (!isRecording) {
            Log.i(TAG, "[stop] 未在聆听，跳过")
            return
        }
        isRecording = false
        try {
            recordingThread?.join(500)
        } catch (_: InterruptedException) {
        }
        recordingThread = null
        // 无论是否 VOICE_COMMUNICATION，start 时都会尝试附着 AEC/NS/AGC，此处统一释放
        duplexModule()?.detachAec()
        try {
            audioRecord?.stop()
        } catch (_: Throwable) {
        }
        audioRecord?.release()
        audioRecord = null
        usingVoiceComm = false
        Log.i(TAG, "[stop] 已停止聆听")
        emit("onSpeechEnd", Arguments.createMap())
    }

    /** 取同一 ReactContext 下的 DuplexAudioModule 实例，用于 AEC 附着/释放 */
    private fun duplexModule(): DuplexAudioModule? =
        reactContext.getNativeModule(DuplexAudioModule::class.java)

    /**
     * 采集 + 流式解码主循环（在后台线程运行）。
     * - OnlineRecognizer：连续喂 PCM，isReady 时 decode，getResult 出 partial。
     * - Vad：并行检测语音起点，首次检出发 onSpeechStart（携带 vad 标记）。
     * - isEndpoint：定稿 → 发 onSpeechResults(final) → reset。
     */
    private fun processLoop(rec: OnlineRecognizer, v: Vad) {
        Log.i(TAG, "[processLoop] 采集循环启动")
        val stream: OnlineStream = rec.createStream()
        val bufferSize = (0.1 * SAMPLE_RATE).toInt() // 100ms
        val buffer = ShortArray(bufferSize)

        // VAD 窗口累积
        val vadPending = ArrayList<Float>()
        var vadSpeechActive = false
        var lastPartial = ""
        var lastMicLevelEmitMs = 0L

        try {
            audioRecord?.startRecording()
            while (isRecording) {
                val n = audioRecord?.read(buffer, 0, buffer.size) ?: 0
                if (n <= 0) continue
                val samples = FloatArray(n) { buffer[it] / 32768.0f }

                // ---- mic RMS（方案 B：与 TTS 播放能量比门控）----
                val nowMs = System.currentTimeMillis()
                if (nowMs - lastMicLevelEmitMs >= 80L) {
                    var sum = 0.0
                    for (s in samples) sum += s * s
                    val rms = kotlin.math.sqrt(sum / samples.size)
                    val level = (rms * 3.5).coerceIn(0.0, 1.0)
                    val map = Arguments.createMap()
                    map.putDouble("level", level)
                    emit("onMicLevel", map)
                    lastMicLevelEmitMs = nowMs
                }

                // ---- ASR 流式解码 ----
                stream.acceptWaveform(samples, sampleRate = SAMPLE_RATE)
                while (rec.isReady(stream)) {
                    rec.decode(stream)
                }
                val isEndpoint = rec.isEndpoint(stream)
                val text = rec.getResult(stream).text

                if (text.isNotBlank() && text != lastPartial) {
                    lastPartial = text
                    val map = Arguments.createMap()
                    map.putString("text", text)
                    map.putDouble("confidence", 0.0)
                    emit("onSpeechPartialResult", map)
                }

                if (isEndpoint) {
                    val finalText = text
                    rec.reset(stream)
                    if (finalText.isNotBlank()) {
                        val map = Arguments.createMap()
                        map.putString("text", finalText)
                        map.putDouble("confidence", 1.0)
                        emit("onSpeechResults", map)
                        Log.i(TAG, "[processLoop] final=\"$finalText\"")
                    }
                    lastPartial = ""
                }

                // ---- VAD 语音起点检测（用于 barge-in 长度门控）----
                vadPending.addAll(samples.toList())
                while (vadPending.size >= VAD_WINDOW) {
                    val window = FloatArray(VAD_WINDOW) { vadPending[it] }
                    v.acceptWaveform(window)
                    repeat(VAD_WINDOW) { vadPending.removeAt(0) }
                    val detected = v.isSpeechDetected()
                    if (detected && !vadSpeechActive) {
                        vadSpeechActive = true
                        emit("onVadSpeechStart", Arguments.createMap())
                    } else if (!detected && vadSpeechActive) {
                        vadSpeechActive = false
                        emit("onVadSpeechEnd", Arguments.createMap())
                    }
                }
                // 清空 vad 输出队列（本模块用 isSpeechDetected 判定，不消费分段）
                while (!v.empty()) v.pop()
            }
        } catch (e: Throwable) {
            Log.e(TAG, "[processLoop] 采集循环异常: ${e.message}", e)
            emitError("record_error", e.message ?: "record error")
        } finally {
            stream.release()
            Log.i(TAG, "[processLoop] 采集循环结束")
        }
    }

    private fun emit(eventName: String, params: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    private fun emitError(code: String, message: String) {
        val map = Arguments.createMap()
        map.putString("code", code)
        map.putString("message", message)
        emit("onSpeechError", map)
    }

    // RN 要求：NativeEventEmitter 需要 addListener/removeListeners 方法（即使空实现）
    @ReactMethod fun addListener(eventName: String) {}

    @ReactMethod fun removeListeners(count: Int) {}
}

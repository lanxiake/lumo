package com.kidsmobile

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.media.MediaCodec
import android.media.MediaDataSource
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.AutomaticGainControl
import android.media.audiofx.NoiseSuppressor
import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.ByteArrayOutputStream
import kotlin.concurrent.thread

/**
 * DuplexAudioModule — 全双工音频链路：原生 TTS 播放 + 硬件 AEC。
 *
 * 阶段二 T2.1：AEC 能力探测（isAecAvailable）。
 * 阶段二 T2.2：mp3(base64) → PCM 解码验证（decodeMp3ToPcm，纯内存不落盘）。
 * 阶段二 T2.3：AudioTrack 原生播放（playTts/stopTts）。
 * 阶段二 T2.4：VOICE_COMMUNICATION + AEC 附着（attachAecToSession）。
 * 嘈杂打断优化：录音 session 附带 NoiseSuppressor + AutomaticGainControl。
 *
 * @ReactModule 注解：SherpaAsrModule 用 getNativeModule(class) 取本实例需要它。
 *
 * 设计：.qoder/design/kids-mobile-voice-quality/语音质量提升方案设计.md 第四节
 *       .qoder/design/kids-mobile-voice-quality/嘈杂环境打断优化设计.md
 */
@ReactModule(name = "DuplexAudio")
class DuplexAudioModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "DuplexAudioModule"
        /** 解码/出队等待超时（微秒），避免异常 mp3 卡死解码线程 */
        private const val CODEC_TIMEOUT_US = 10_000L

        /**
         * 播放用途开关：
         * - false：USAGE_MEDIA（走 STREAM_MUSIC，即用户音量键实际控制的流）。
         * - true ：USAGE_VOICE_COMMUNICATION（走 STREAM_VOICE_CALL）。
         *
         * 改回 false：VOICE_COMMUNICATION 播放在未调用 AudioManager.setMode(MODE_IN_COMMUNICATION)
         * 时仍落到通话流，该流在小米/红米等 MIUI 设备上最大音量远低于媒体流，
         * 导致「开到最大也听不清」。AEC 硬件回声消除在 HAL 层依据扬声器实际输出做参考，
         * 与播放侧 AudioAttributes.usage 标签无关，改回 MEDIA 不影响 AEC 抑制效果。
         */
        private const val USE_VOICE_COMMUNICATION_PLAYBACK = false
    }

    override fun getName(): String = "DuplexAudio"

    @Volatile private var audioTrack: AudioTrack? = null
    @Volatile private var playThread: Thread? = null
    /** 播放世代：stopTts 或新 playTts 递增，令旧播放线程自行退出 */
    @Volatile private var playEpoch = 0
    @Volatile private var echoCanceler: AcousticEchoCanceler? = null
    @Volatile private var noiseSuppressor: NoiseSuppressor? = null
    @Volatile private var automaticGainControl: AutomaticGainControl? = null

    /** 内存字节数组包装成 MediaExtractor 可读的数据源，避免写临时文件 */
    private class ByteArrayMediaDataSource(private val data: ByteArray) : MediaDataSource() {
        override fun readAt(position: Long, buffer: ByteArray, offset: Int, size: Int): Int {
            if (position >= data.size) return -1
            val remaining = data.size - position
            val toRead = minOf(size.toLong(), remaining).toInt()
            System.arraycopy(data, position.toInt(), buffer, offset, toRead)
            return toRead
        }

        override fun getSize(): Long = data.size.toLong()
        override fun close() {}
    }

    /** 解码结果：16-bit PCM 字节 + 采样率 + 声道数 */
    private data class PcmResult(val pcm: ByteArray, val sampleRate: Int, val channelCount: Int)

    /**
     * mp3 字节 → PCM（MediaExtractor + MediaCodec 平台硬解码，零第三方依赖）。
     * 单句 TTS 音频通常几秒钟，体积小，整段解码后一次性返回，不做流式解码。
     */
    private fun decodeMp3ToPcm(mp3Bytes: ByteArray): PcmResult {
        val extractor = MediaExtractor()
        extractor.setDataSource(ByteArrayMediaDataSource(mp3Bytes))
        if (extractor.trackCount == 0) throw IllegalStateException("mp3 无音轨")
        val format = extractor.getTrackFormat(0)
        val mime = format.getString(MediaFormat.KEY_MIME)
            ?: throw IllegalStateException("音轨缺少 MIME 类型")
        val sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
        val channelCount = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
        extractor.selectTrack(0)

        val codec = MediaCodec.createDecoderByType(mime)
        codec.configure(format, null, null, 0)
        codec.start()

        val output = ByteArrayOutputStream()
        val bufferInfo = MediaCodec.BufferInfo()
        var sawInputEos = false
        var sawOutputEos = false

        try {
            while (!sawOutputEos) {
                if (!sawInputEos) {
                    val inIndex = codec.dequeueInputBuffer(CODEC_TIMEOUT_US)
                    if (inIndex >= 0) {
                        val inBuffer = codec.getInputBuffer(inIndex)
                            ?: throw IllegalStateException("input buffer null")
                        val sampleSize = extractor.readSampleData(inBuffer, 0)
                        if (sampleSize < 0) {
                            codec.queueInputBuffer(inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                            sawInputEos = true
                        } else {
                            codec.queueInputBuffer(inIndex, 0, sampleSize, extractor.sampleTime, 0)
                            extractor.advance()
                        }
                    }
                }

                val outIndex = codec.dequeueOutputBuffer(bufferInfo, CODEC_TIMEOUT_US)
                if (outIndex >= 0) {
                    if (bufferInfo.size > 0) {
                        val outBuffer = codec.getOutputBuffer(outIndex)
                            ?: throw IllegalStateException("output buffer null")
                        val chunk = ByteArray(bufferInfo.size)
                        outBuffer.get(chunk)
                        output.write(chunk)
                    }
                    codec.releaseOutputBuffer(outIndex, false)
                    if ((bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                        sawOutputEos = true
                    }
                }
            }
        } finally {
            codec.stop()
            codec.release()
            extractor.release()
        }

        return PcmResult(output.toByteArray(), sampleRate, channelCount)
    }

    /**
     * 探测当前设备是否支持硬件 AcousticEchoCanceler。
     * 注意：返回 true 不代表实际抵消效果好（设备相关），仅作为全双工分支的前置门槛。
     */
    @ReactMethod
    fun isAecAvailable(promise: Promise) {
        try {
            val available = AcousticEchoCanceler.isAvailable()
            Log.i(TAG, "[isAecAvailable] AcousticEchoCanceler.isAvailable()=$available")
            promise.resolve(available)
        } catch (e: Throwable) {
            Log.e(TAG, "[isAecAvailable] 探测失败: ${e.message}", e)
            promise.resolve(false)
        }
    }

    /**
     * 在指定 AudioRecord session 上创建并启用 AcousticEchoCanceler，
     * 并在设备支持时附带 NoiseSuppressor + AutomaticGainControl（降噪与人声增益）。
     * 供 SherpaAsrModule 在 start() 成功后把 audioRecord.audioSessionId 传入附着。
     * AEC 附着在录音 session 上，平台 HAL 自动感知扬声器播放信号作参考。
     */
    fun attachAecToSession(sessionId: Int): Boolean {
        return try {
            detachAecInternal()
            if (!AcousticEchoCanceler.isAvailable()) {
                Log.w(TAG, "[attachAec] 设备不支持 AEC，跳过")
                emitAppLog("AEC unavailable → NS/AGC only")
                // AEC 不可用时仍尝试挂 NS/AGC，改善嘈杂拾音
                attachNsAgcToSession(sessionId)
                return false
            }
            val aec = AcousticEchoCanceler.create(sessionId)
            if (aec == null) {
                Log.w(TAG, "[attachAec] create 返回 null，session=$sessionId")
                emitAppLog("AEC create null → NS/AGC only")
                attachNsAgcToSession(sessionId)
                return false
            }
            aec.enabled = true
            echoCanceler = aec
            Log.i(TAG, "[attachAec] 已附着并启用 AEC session=$sessionId enabled=${aec.enabled}")
            emitAppLog("AEC attached session=$sessionId")
            attachNsAgcToSession(sessionId)
            true
        } catch (e: Throwable) {
            Log.e(TAG, "[attachAec] 失败: ${e.message}", e)
            emitAppLog("AEC attach failed: ${e.message}")
            false
        }
    }

    /**
     * 在录音 session 上启用 NoiseSuppressor + AutomaticGainControl（若硬件可用）。
     * 用于嘈杂环境压低环境噪声、抬高近场人声，降低误打断。
     */
    private fun attachNsAgcToSession(sessionId: Int) {
        detachNsAgcInternal()
        var nsOk = false
        var agcOk = false
        try {
            if (NoiseSuppressor.isAvailable()) {
                val ns = NoiseSuppressor.create(sessionId)
                if (ns != null) {
                    ns.enabled = true
                    noiseSuppressor = ns
                    nsOk = true
                    Log.i(TAG, "[attachNsAgc] NoiseSuppressor enabled session=$sessionId")
                } else {
                    Log.w(TAG, "[attachNsAgc] NoiseSuppressor.create 返回 null")
                }
            } else {
                Log.i(TAG, "[attachNsAgc] 设备不支持 NoiseSuppressor")
            }
        } catch (e: Throwable) {
            Log.e(TAG, "[attachNsAgc] NS 失败: ${e.message}", e)
        }
        try {
            if (AutomaticGainControl.isAvailable()) {
                val agc = AutomaticGainControl.create(sessionId)
                if (agc != null) {
                    agc.enabled = true
                    automaticGainControl = agc
                    agcOk = true
                    Log.i(TAG, "[attachNsAgc] AutomaticGainControl enabled session=$sessionId")
                } else {
                    Log.w(TAG, "[attachNsAgc] AutomaticGainControl.create 返回 null")
                }
            } else {
                Log.i(TAG, "[attachNsAgc] 设备不支持 AutomaticGainControl")
            }
        } catch (e: Throwable) {
            Log.e(TAG, "[attachNsAgc] AGC 失败: ${e.message}", e)
        }
        emitAppLog("NS=${if (nsOk) "on" else "off"} AGC=${if (agcOk) "on" else "off"} session=$sessionId")
    }

    /** 释放 AEC / NS / AGC（SherpaAsrModule stop 时调用） */
    fun detachAec() {
        detachAecInternal()
    }

    private fun detachAecInternal() {
        val aec = echoCanceler
        echoCanceler = null
        if (aec != null) {
            try {
                aec.enabled = false
                aec.release()
                Log.i(TAG, "[detachAec] 已释放 AEC")
            } catch (_: Throwable) {
            }
        }
        detachNsAgcInternal()
    }

    /** 释放 NoiseSuppressor / AutomaticGainControl */
    private fun detachNsAgcInternal() {
        val ns = noiseSuppressor
        noiseSuppressor = null
        if (ns != null) {
            try {
                ns.enabled = false
                ns.release()
                Log.i(TAG, "[detachNsAgc] 已释放 NoiseSuppressor")
            } catch (_: Throwable) {
            }
        }
        val agc = automaticGainControl
        automaticGainControl = null
        if (agc != null) {
            try {
                agc.enabled = false
                agc.release()
                Log.i(TAG, "[detachNsAgc] 已释放 AutomaticGainControl")
            } catch (_: Throwable) {
            }
        }
    }

    /**
     * T2.2 spike：解码 mp3(base64) 并返回统计信息，验证解码链路可行。
     * 不接 AudioTrack，仅验证 MediaExtractor/MediaCodec 解码不抛异常、字节数符合预期。
     */
    @ReactMethod
    fun decodeMp3Debug(audioBase64: String, promise: Promise) {
        thread(isDaemon = true) {
            try {
                val mp3Bytes = Base64.decode(audioBase64, Base64.DEFAULT)
                Log.i(TAG, "[decodeMp3Debug] 输入 mp3 字节数=${mp3Bytes.size}")
                val result = decodeMp3ToPcm(mp3Bytes)
                val durationSec = result.pcm.size.toDouble() / (result.sampleRate * result.channelCount * 2)
                Log.i(
                    TAG,
                    "[decodeMp3Debug] 解码完成 pcmBytes=${result.pcm.size} sampleRate=${result.sampleRate} " +
                        "channelCount=${result.channelCount} 估算时长=${"%.2f".format(durationSec)}s",
                )
                val map = Arguments.createMap()
                map.putInt("pcmBytes", result.pcm.size)
                map.putInt("sampleRate", result.sampleRate)
                map.putInt("channelCount", result.channelCount)
                map.putDouble("durationSec", durationSec)
                promise.resolve(map)
            } catch (e: Throwable) {
                Log.e(TAG, "[decodeMp3Debug] 解码失败: ${e.message}", e)
                promise.reject("decode_failed", e.message, e)
            }
        }
    }

    /**
     * 播放一段 TTS mp3(base64)：后台线程解码 → AudioTrack 流式播放。
     * 发 onDuplexPlayStart / onDuplexPlayEnd / onDuplexPlayError 事件（与 AudioPlayerEvent 语义对齐）。
     * 不发 level 事件：口型由独立 rAF 波形驱动，无需音量采样。
     */
    @ReactMethod
    fun playTts(audioBase64: String, promise: Promise) {
        val epoch = ++playEpoch
        stopTrackInternal()
        playThread = thread(isDaemon = true) {
            try {
                val mp3Bytes = Base64.decode(audioBase64, Base64.DEFAULT)
                val pcm = decodeMp3ToPcm(mp3Bytes)
                if (epoch != playEpoch) {
                    Log.i(TAG, "[playTts] epoch 过期($epoch != $playEpoch)，放弃播放")
                    return@thread
                }

                val channelMask =
                    if (pcm.channelCount >= 2) AudioFormat.CHANNEL_OUT_STEREO
                    else AudioFormat.CHANNEL_OUT_MONO
                val minBuf = AudioTrack.getMinBufferSize(
                    pcm.sampleRate,
                    channelMask,
                    AudioFormat.ENCODING_PCM_16BIT,
                )
                val usage =
                    if (USE_VOICE_COMMUNICATION_PLAYBACK) AudioAttributes.USAGE_VOICE_COMMUNICATION
                    else AudioAttributes.USAGE_MEDIA
                val attrs = AudioAttributes.Builder()
                    .setUsage(usage)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
                val format = AudioFormat.Builder()
                    .setSampleRate(pcm.sampleRate)
                    .setChannelMask(channelMask)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .build()
                val track = AudioTrack.Builder()
                    .setAudioAttributes(attrs)
                    .setAudioFormat(format)
                    .setBufferSizeInBytes(maxOf(minBuf, pcm.pcm.size.coerceAtMost(minBuf * 4)))
                    .setTransferMode(AudioTrack.MODE_STREAM)
                    .build()
                audioTrack = track

                track.play()
                emit("onDuplexPlayStart", Arguments.createMap())
                Log.i(TAG, "[playTts] 开始播放 pcmBytes=${pcm.pcm.size} sampleRate=${pcm.sampleRate} usage=$usage")

                // 分块写入并上报真实播放 RMS，供 barge-in 能量比门控（方案 B）
                val bytesPerFrame = 2 * pcm.channelCount
                val chunkBytes = maxOf(bytesPerFrame * (pcm.sampleRate / 20), bytesPerFrame) // ~50ms
                var offset = 0
                var lastLevelEmitMs = 0L
                while (offset < pcm.pcm.size && epoch == playEpoch) {
                    val toWrite = minOf(chunkBytes, pcm.pcm.size - offset)
                    val written = track.write(pcm.pcm, offset, toWrite)
                    if (written <= 0) break
                    val nowMs = System.currentTimeMillis()
                    if (nowMs - lastLevelEmitMs >= 80L) {
                        emitPlayLevel(rmsOfPcm16(pcm.pcm, offset, written))
                        lastLevelEmitMs = nowMs
                    }
                    offset += written
                }

                if (epoch == playEpoch) {
                    // 等缓冲播完再报结束（write 是灌入缓冲，非播放完成）
                    track.stop()
                    emitPlayLevel(0.0)
                    emit("onDuplexPlayEnd", Arguments.createMap())
                    Log.i(TAG, "[playTts] 播放结束")
                }
            } catch (e: Throwable) {
                Log.e(TAG, "[playTts] 播放失败: ${e.message}", e)
                emitError("play_error", e.message ?: "unknown")
            } finally {
                if (epoch == playEpoch) stopTrackInternal()
            }
        }
        promise.resolve(true)
    }

    /** 停止当前播放并释放 AudioTrack */
    @ReactMethod
    fun stopTts(promise: Promise) {
        playEpoch++
        stopTrackInternal()
        promise.resolve(true)
    }

    private fun stopTrackInternal() {
        val track = audioTrack ?: return
        audioTrack = null
        try {
            if (track.playState != AudioTrack.PLAYSTATE_STOPPED) track.stop()
        } catch (_: Throwable) {
        }
        try {
            track.release()
        } catch (_: Throwable) {
        }
    }

    /** 16-bit PCM 片段 RMS，归一化到约 0~1（乘系数便于与 mic level 同比） */
    private fun rmsOfPcm16(pcm: ByteArray, offset: Int, length: Int): Double {
        if (length < 2) return 0.0
        var sum = 0.0
        var count = 0
        var i = offset
        val end = offset + length - 1
        while (i < end) {
            val lo = pcm[i].toInt() and 0xff
            val hi = pcm[i + 1].toInt()
            val sample = ((hi shl 8) or lo).toShort().toInt() / 32768.0
            sum += sample * sample
            count += 1
            i += 2
        }
        if (count == 0) return 0.0
        val rms = kotlin.math.sqrt(sum / count)
        return (rms * 3.5).coerceIn(0.0, 1.0)
    }

    /** 上报播放音量给 JS（口型 + barge-in 能量门控） */
    private fun emitPlayLevel(level: Double) {
        val map = Arguments.createMap()
        map.putDouble("level", level)
        emit("onDuplexPlayLevel", map)
    }

    private fun emit(eventName: String, params: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    /** 关键音频节点事件（JS 侧已不再展示运行日志；保留 emit 供日后诊断） */
    private fun emitAppLog(message: String) {
        val map = Arguments.createMap()
        map.putString("tag", "audio")
        map.putString("message", message)
        emit("onAppNativeLog", map)
    }

    private fun emitError(code: String, message: String) {
        val map = Arguments.createMap()
        map.putString("code", code)
        map.putString("message", message)
        emit("onDuplexPlayError", map)
    }

    // RN NativeEventEmitter 要求（即使空实现）
    @ReactMethod fun addListener(eventName: String) {}

    @ReactMethod fun removeListeners(count: Int) {}
}

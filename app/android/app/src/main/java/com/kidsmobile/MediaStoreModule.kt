package com.kidsmobile

import android.content.ContentValues
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import com.facebook.react.bridge.*
import java.io.File
import java.io.FileOutputStream

/**
 * MediaStoreModule —— 将 base64 图片写入系统相册（Pictures/小美画廊）。
 *
 * data: URI 无法用浏览器打开，故 GalleryScreen 保存图片必须走原生写入：
 *  - API ≥ 29（Q）：MediaStore + RELATIVE_PATH + IS_PENDING 事务，无需存储权限。
 *  - API < 29：写入公共 Pictures 目录 + MediaScanner 通知相册刷新，
 *    需运行时 WRITE_EXTERNAL_STORAGE（RN 侧已先申请）。
 */
class MediaStoreModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "MediaStore"

    private val albumName = "小美画廊"

    /**
     * 保存 base64 图片到相册。
     *
     * @param base64   不含 data URI 前缀的纯 base64
     * @param mimeType image/png | image/jpeg | image/webp
     */
    @ReactMethod
    fun saveImageBase64(base64: String, mimeType: String, promise: Promise) {
        try {
            val bytes = Base64.decode(base64, Base64.DEFAULT)
            if (bytes.isEmpty()) {
                promise.reject("EMPTY_IMAGE", "图片数据为空")
                return
            }
            val ext = extensionForMime(mimeType)
            val fileName = "kids_${System.currentTimeMillis()}.$ext"

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                saveViaMediaStore(fileName, mimeType, bytes)
            } else {
                saveViaLegacyPath(fileName, bytes)
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SAVE_ERROR", e.message, e)
        }
    }

    /** API ≥ 29：MediaStore 事务写入，自动归入相册无需权限。 */
    private fun saveViaMediaStore(fileName: String, mimeType: String, bytes: ByteArray) {
        val resolver = reactApplicationContext.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, fileName)
            put(MediaStore.Images.Media.MIME_TYPE, mimeType)
            put(
                MediaStore.Images.Media.RELATIVE_PATH,
                "${Environment.DIRECTORY_PICTURES}/$albumName",
            )
            put(MediaStore.Images.Media.IS_PENDING, 1)
        }
        val collection = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val uri = resolver.insert(collection, values)
            ?: throw IllegalStateException("无法创建相册记录")
        resolver.openOutputStream(uri)?.use { it.write(bytes) }
            ?: throw IllegalStateException("无法写入图片数据")
        values.clear()
        values.put(MediaStore.Images.Media.IS_PENDING, 0)
        resolver.update(uri, values, null, null)
    }

    /** API < 29：写公共 Pictures 目录 + MediaScanner 刷新相册。 */
    private fun saveViaLegacyPath(fileName: String, bytes: ByteArray) {
        @Suppress("DEPRECATION")
        val picturesDir =
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES)
        val albumDir = File(picturesDir, albumName)
        if (!albumDir.exists()) albumDir.mkdirs()
        val file = File(albumDir, fileName)
        FileOutputStream(file).use { it.write(bytes) }
        MediaScannerConnection.scanFile(
            reactApplicationContext,
            arrayOf(file.absolutePath),
            null,
            null,
        )
    }

    private fun extensionForMime(mimeType: String): String = when (mimeType.lowercase()) {
        "image/png" -> "png"
        "image/webp" -> "webp"
        else -> "jpg"
    }
}

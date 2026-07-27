package com.kidsmobile

import android.content.Context
import android.content.SharedPreferences
import com.facebook.react.bridge.*

/**
 * 轻量 SharedPreferences NativeModule —— 用于 dev 联调持久化 deviceToken / deviceId。
 *
 * 不引入外部依赖（AsyncStorage 要求 minSdk 24，本项目是 23）。
 * 生产须替换为 keychain/keystore 实现。
 */
class SharedPrefsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SharedPrefs"

    private val prefs: SharedPreferences by lazy {
        reactContext.getSharedPreferences("kidsmobile_prefs", Context.MODE_PRIVATE)
    }

    @ReactMethod
    fun getItem(key: String, promise: Promise) {
        try {
            val value = prefs.getString(key, null)
            promise.resolve(value)
        } catch (e: Exception) {
            promise.reject("GET_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun setItem(key: String, value: String, promise: Promise) {
        try {
            prefs.edit().putString(key, value).apply()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SET_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun removeItem(key: String, promise: Promise) {
        try {
            prefs.edit().remove(key).apply()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("REMOVE_ERROR", e.message, e)
        }
    }
}

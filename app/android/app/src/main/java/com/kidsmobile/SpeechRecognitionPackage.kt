package com.kidsmobile

import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ReactShadowNode
import com.facebook.react.uimanager.ViewManager

/**
 * SpeechRecognitionModule 的 ReactPackage 注册。
 */
class SpeechRecognitionPackage : ReactPackage {
    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): MutableList<ViewManager<View, ReactShadowNode<*>>> = mutableListOf()

    override fun createNativeModules(
        reactContext: ReactApplicationContext
    ): MutableList<NativeModule> = mutableListOf(
        SharedPrefsModule(reactContext),
        SherpaAsrModule(reactContext),
        DuplexAudioModule(reactContext),
        MediaStoreModule(reactContext),
    )
}

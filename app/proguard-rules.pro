# Minimal, targeted R8 rules. Do not disable optimization or keep entire app.
# Bundled JavaScript invokes methods by their annotation and *unobfuscated*
# public method names. This rule preserves the bridge contract and nothing else.
-keepattributes RuntimeVisibleAnnotations
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# The manifest, Android framework and AndroidX libraries supply their own
# necessary component/consumer rules. Avoid broad wildcard package keeps.

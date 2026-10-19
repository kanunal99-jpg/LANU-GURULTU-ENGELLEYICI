plugins { id("com.android.application") }

android {
    namespace = "com.lanu.sesli"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.lanu.sesli"
        minSdk = 26
        targetSdk = 35
        versionCode = providers.environmentVariable("LANU_VERSION_CODE").orNull?.toInt() ?: 1
        versionName = "2.0.2"
        testInstrumentationRunner = "com.lanu.sesli.SmokeInstrumentation"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    lint { abortOnError = true }
}
dependencies { implementation("androidx.webkit:webkit:1.11.0") }

plugins { id("com.android.application") }

val otaManifestUrl = providers.environmentVariable("LANU_OTA_MANIFEST_URL").orNull ?: ""
require(otaManifestUrl.isEmpty() || otaManifestUrl.matches(Regex("https://[A-Za-z0-9._/~%-]+"))) {
    "LANU_OTA_MANIFEST_URL must be a plain HTTPS URL without query parameters"
}

android {
    namespace = "com.lanu.sesli"
    compileSdk = 35
    buildFeatures { buildConfig = true }
    defaultConfig {
        applicationId = "com.lanu.sesli"
        minSdk = 26
        targetSdk = 35
        versionCode = providers.environmentVariable("LANU_VERSION_CODE").orNull?.toInt() ?: 1
        versionName = "2.0.4"
        buildConfigField("String", "OTA_MANIFEST_URL", "\"$otaManifestUrl\"")
        testInstrumentationRunner = "com.lanu.sesli.SmokeInstrumentation"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    lint { abortOnError = true }
}
dependencies {
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("androidx.core:core:1.13.1")
}

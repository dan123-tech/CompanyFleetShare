package com.company.carsharing;

import android.app.Application;

import com.company.carsharing.R;
import com.google.android.material.color.DynamicColors;

/**
 * API base URL comes from {@code R.string.api_base_url}, injected at build time from
 * {@code fleetshareApiBaseUrl} in {@code android/gradle.properties} (your Vercel / production HTTPS origin).
 */
public class CarSharingApplication extends Application {

    private static CarSharingApplication instance;

    /**
     * Only if {@link #getApiBaseUrl()} runs before {@code Application} is attached. Keep in sync with
     * {@code app/build.gradle} default when {@code fleetshareApiBaseUrl} is unset.
     */
    private static final String FALLBACK_API_BASE_URL = "https://YOUR-VERCEL-APP.vercel.app/";

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        DynamicColors.applyToActivitiesIfAvailable(this);
    }

    public static String getApiBaseUrl() {
        if (instance == null) {
            return normalizeBaseUrl(FALLBACK_API_BASE_URL);
        }
        return normalizeBaseUrl(instance.getString(R.string.api_base_url));
    }

    static String normalizeBaseUrl(String url) {
        if (url == null) {
            return normalizeBaseUrl(FALLBACK_API_BASE_URL);
        }
        String t = url.trim();
        if (t.isEmpty()) {
            return normalizeBaseUrl(FALLBACK_API_BASE_URL);
        }
        if (!t.startsWith("http://") && !t.startsWith("https://")) {
            t = "https://" + t;
        }
        if (!t.endsWith("/")) {
            t += "/";
        }
        return t;
    }
}

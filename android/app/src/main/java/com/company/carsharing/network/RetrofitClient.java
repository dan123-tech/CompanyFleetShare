package com.company.carsharing.network;

import com.company.carsharing.CarSharingApplication;
import com.company.carsharing.data.preferences.SessionCookieStore;

import okhttp3.OkHttpClient;
import okhttp3.logging.HttpLoggingInterceptor;
import retrofit2.Retrofit;
import retrofit2.converter.gson.GsonConverterFactory;

/**
 * Singleton Retrofit client. Base URL from {@link CarSharingApplication} (build-time {@code R.string.api_base_url}).
 */
public final class RetrofitClient {

    private static volatile ApiService apiService;
    private static volatile OkHttpClient okHttpClient;

    public static ApiService getApiService(SessionCookieStore sessionStore) {
        if (apiService == null) {
            synchronized (RetrofitClient.class) {
                if (apiService == null) {
                    apiService = createRetrofit(sessionStore).create(ApiService.class);
                }
            }
        }
        return apiService;
    }

    public static void reset() {
        synchronized (RetrofitClient.class) {
            apiService = null;
            okHttpClient = null;
        }
    }

    private static Retrofit createRetrofit(SessionCookieStore sessionStore) {
        HttpLoggingInterceptor logging = new HttpLoggingInterceptor();
        logging.setLevel(HttpLoggingInterceptor.Level.BODY);

        okHttpClient = new OkHttpClient.Builder()
                .addInterceptor(new SessionCookieInterceptor(sessionStore))
                .addInterceptor(logging)
                .build();

        return new Retrofit.Builder()
                .baseUrl(CarSharingApplication.getApiBaseUrl())
                .client(okHttpClient)
                .addConverterFactory(GsonConverterFactory.create())
                .build();
    }
}

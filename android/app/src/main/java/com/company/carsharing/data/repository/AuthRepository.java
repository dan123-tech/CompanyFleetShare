package com.company.carsharing.data.repository;

import android.content.Context;

import androidx.annotation.NonNull;

import com.company.carsharing.data.preferences.SecureSessionPreferences;
import com.company.carsharing.reminders.ReservationAlarmScheduler;
import com.company.carsharing.models.LoginRequest;
import com.company.carsharing.models.LoginResponse;
import com.company.carsharing.models.RegisterRequest;
import com.company.carsharing.models.RegisterResponse;
import com.company.carsharing.models.User;
import com.company.carsharing.network.ApiService;
import com.company.carsharing.network.RetrofitClient;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

/**
 * Repository for auth operations. Uses Retrofit and SessionPreferences.
 */
public class AuthRepository {

    private final SecureSessionPreferences sessionPreferences;

    public AuthRepository(Context context) {
        this.sessionPreferences = new SecureSessionPreferences(context);
    }

    /** Fresh after {@link RetrofitClient#reset()} (e.g. API base URL changed). */
    private ApiService api() {
        return RetrofitClient.getApiService(sessionPreferences);
    }

    public SecureSessionPreferences getSessionPreferences() {
        return sessionPreferences;
    }

    public boolean isLoggedIn() {
        return sessionPreferences.isLoggedIn();
    }

    public void login(@NonNull String email, @NonNull String password, boolean rememberMe, @NonNull AuthCallback callback) {
        LoginRequest request = new LoginRequest(email.trim(), password);
        api().login(request).enqueue(new Callback<LoginResponse>() {
            @Override
            public void onResponse(@NonNull Call<LoginResponse> call, @NonNull Response<LoginResponse> response) {
                try {
                    if (response.isSuccessful() && response.body() != null) {
                        LoginResponse body = response.body();
                        if (body != null && body.getUser() != null) {
                            sessionPreferences.saveUser(body.getUser());
                            if (rememberMe) {
                                sessionPreferences.saveCredentials(email.trim(), password);
                            } else {
                                sessionPreferences.clearSavedCredentials();
                            }
                            sessionPreferences.setRememberMe(rememberMe);
                            callback.onSuccess(body.getUser());
                        } else {
                            callback.onError("Invalid response");
                        }
                    } else {
                        String errorMsg = "Invalid email or password";
                        try {
                            if (response.errorBody() != null) {
                                String msg = response.errorBody().string();
                                if (msg != null && msg.contains("error")) errorMsg = msg;
                            }
                        } catch (Exception ignored) { }
                        callback.onError(errorMsg);
                    }
                } catch (Exception e) {
                    callback.onError(e.getMessage() != null ? e.getMessage() : "Login failed");
                }
            }

            @Override
            public void onFailure(@NonNull Call<LoginResponse> call, @NonNull Throwable t) {
                try {
                    String msg = t.getMessage();
                    if (msg == null) msg = "Network error";
                    if (t instanceof java.net.ConnectException) {
                        msg = "Cannot reach server. Check your internet connection and that the app is built with the correct API URL in android/gradle.properties (fleetshareApiBaseUrl).";
                    }
                    callback.onError(msg);
                } catch (Exception e) {
                    callback.onError("Network error");
                }
            }
        });
    }

    public void register(@NonNull String name, @NonNull String email, @NonNull String password, @NonNull AuthCallback callback) {
        RegisterRequest request = new RegisterRequest(email.trim(), password, (name != null ? name.trim() : ""));
        api().register(request).enqueue(new Callback<RegisterResponse>() {
            @Override
            public void onResponse(@NonNull Call<RegisterResponse> call, @NonNull Response<RegisterResponse> response) {
                try {
                    if (response.isSuccessful() && response.body() != null && response.body().getUser() != null) {
                        callback.onSuccess(response.body().getUser());
                    } else {
                        String errorMsg = "Registration failed";
                        try {
                            if (response.errorBody() != null) {
                                String msg = response.errorBody().string();
                                if (msg != null && msg.contains("already registered")) errorMsg = "Email already registered";
                                else if (msg != null && msg.contains("Password")) errorMsg = "Password must be at least 8 characters";
                            }
                        } catch (Exception ignored) { }
                        callback.onError(errorMsg);
                    }
                } catch (Exception e) {
                    callback.onError(e.getMessage() != null ? e.getMessage() : "Registration failed");
                }
            }

            @Override
            public void onFailure(@NonNull Call<RegisterResponse> call, @NonNull Throwable t) {
                try {
                    String msg = t.getMessage();
                    if (msg == null) msg = "Network error";
                    if (t instanceof java.net.ConnectException) msg = "Cannot reach server. Is the app running?";
                    callback.onError(msg);
                } catch (Exception e) {
                    callback.onError("Network error");
                }
            }
        });
    }

    public void logout(Context context) {
        if (context != null) {
            ReservationAlarmScheduler.cancelAll(context.getApplicationContext());
        }
        sessionPreferences.clearSession();
        sessionPreferences.clearSavedCredentials();
        RetrofitClient.reset();
    }

    public void refreshSession(final SessionCallback callback) {
        api().getSession().enqueue(new retrofit2.Callback<com.company.carsharing.models.SessionResponse>() {
            @Override
            public void onResponse(@NonNull retrofit2.Call<com.company.carsharing.models.SessionResponse> call,
                                  @NonNull retrofit2.Response<com.company.carsharing.models.SessionResponse> response) {
                if (response.isSuccessful() && response.body() != null && response.body().getUser() != null) {
                    sessionPreferences.saveUser(response.body().getUser());
                    callback.onLoaded(response.body().getUser(), response.body().getCompany());
                } else {
                    callback.onError("Session expired");
                }
            }
            @Override
            public void onFailure(@NonNull retrofit2.Call<com.company.carsharing.models.SessionResponse> call, @NonNull Throwable t) {
                callback.onError(t.getMessage() != null ? t.getMessage() : "Network error");
            }
        });
    }

    public interface SessionCallback {
        void onLoaded(com.company.carsharing.models.User user, com.company.carsharing.models.Company company);
        void onError(String message);
    }

    public interface AuthCallback {
        void onSuccess(User user);
        void onError(String message);
    }
}

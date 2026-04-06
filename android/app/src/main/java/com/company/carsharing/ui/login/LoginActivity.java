package com.company.carsharing.ui.login;

import android.content.Intent;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.View;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.ViewModelProvider;

import com.company.carsharing.CarSharingApplication;
import com.company.carsharing.R;
import com.company.carsharing.data.repository.AuthRepository;
import com.company.carsharing.databinding.ActivityLoginBinding;
import com.company.carsharing.models.User;
import com.company.carsharing.ui.MainActivity;

import java.util.concurrent.Executor;

/**
 * Login Activity: session cookie + user info. Optional: keep me logged in (saved credentials),
 * auto-login on next launch, and fingerprint login.
 */
public class LoginActivity extends AppCompatActivity {

    private ActivityLoginBinding binding;
    private LoginViewModel viewModel;
    private AuthRepository authRepository;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        binding = ActivityLoginBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());

        authRepository = new AuthRepository(this);
        viewModel = new ViewModelProvider(this).get(LoginViewModel.class);

        if (binding.rememberMe != null) {
            binding.rememberMe.setChecked(authRepository.getSessionPreferences().getRememberMe());
        }
        if (binding.useFingerprint != null) {
            binding.useFingerprint.setChecked(authRepository.getSessionPreferences().getBiometricEnabled());
            int canAuth = BiometricManager.from(this).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.BIOMETRIC_WEAK);
            binding.useFingerprint.setVisibility(canAuth == BiometricManager.BIOMETRIC_SUCCESS ? View.VISIBLE : View.GONE);
        }
        if (authRepository.getSessionPreferences().getSavedEmail() != null && binding.email != null) {
            binding.email.setText(authRepository.getSessionPreferences().getSavedEmail());
        }

        binding.buttonLogin.setOnClickListener(v -> {
            String email = binding.email.getText() != null ? binding.email.getText().toString() : "";
            String password = binding.password.getText() != null ? binding.password.getText().toString() : "";
            boolean rememberMe = binding.rememberMe != null && binding.rememberMe.isChecked();
            viewModel.login(email, password, rememberMe);
        });

        if (binding.linkCreateAccount != null) {
            binding.linkCreateAccount.setOnClickListener(v -> {
                startActivity(new Intent(this, RegisterActivity.class));
            });
        }

        observeViewModel();

        if (authRepository.getSessionPreferences().hasSavedCredentials()
                && authRepository.getSessionPreferences().getRememberMe()) {
            if (authRepository.getSessionPreferences().getBiometricEnabled()) {
                showBiometricThenAutoLogin();
            } else {
                tryAutoLogin();
            }
        }
    }

    private void tryAutoLogin() {
        String email = authRepository.getSessionPreferences().getSavedEmail();
        String password = authRepository.getSessionPreferences().getSavedPassword();
        if (email == null || password == null || email.isEmpty() || password.isEmpty()) return;
        viewModel.login(email, password, true);
    }

    private void showBiometricThenAutoLogin() {
        Executor executor = ContextCompat.getMainExecutor(this);
        BiometricPrompt biometricPrompt = new BiometricPrompt(this, executor, new BiometricPrompt.AuthenticationCallback() {
            @Override
            public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                super.onAuthenticationSucceeded(result);
                runOnUiThread(LoginActivity.this::tryAutoLogin);
            }
            @Override
            public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                super.onAuthenticationError(errorCode, errString);
                runOnUiThread(() -> {
                    if (errorCode != BiometricPrompt.ERROR_NEGATIVE_BUTTON && errorCode != BiometricPrompt.ERROR_USER_CANCELED) {
                        Toast.makeText(LoginActivity.this, errString.toString(), Toast.LENGTH_SHORT).show();
                    }
                });
            }
        });
        BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(getString(R.string.biometric_title_fmt, getString(R.string.app_name)))
                .setSubtitle(getString(R.string.biometric_subtitle))
                .setNegativeButtonText(getString(R.string.use_password))
                .build();
        biometricPrompt.authenticate(promptInfo);
    }

    private void observeViewModel() {
        viewModel.getLoading().observe(this, loading -> {
            if (isFinishing() || binding == null) return;
            binding.progress.setVisibility(loading != null && loading ? View.VISIBLE : View.GONE);
            binding.buttonLogin.setEnabled(loading == null || !loading);
        });

        viewModel.getLoginSuccess().observe(this, this::onLoginSuccess);

        viewModel.getError().observe(this, message -> {
            if (isFinishing() || binding == null) return;
            if (!TextUtils.isEmpty(message)) {
                binding.errorText.setVisibility(View.VISIBLE);
                binding.errorText.setText(message);
                Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
            } else {
                binding.errorText.setVisibility(View.GONE);
            }
        });
    }

    private void onLoginSuccess(User user) {
        if (isFinishing() || binding == null) return;
        if (user == null) return;
        boolean rememberMe = binding.rememberMe != null && binding.rememberMe.isChecked();
        if (rememberMe && binding.useFingerprint != null) {
            authRepository.getSessionPreferences().setBiometricEnabled(binding.useFingerprint.isChecked());
        } else {
            authRepository.getSessionPreferences().setBiometricEnabled(false);
        }
        binding.errorText.setVisibility(View.GONE);
        String name = user.getName();
        String email = user.getEmail();
        String display = (name != null && !name.isEmpty()) ? name : (email != null ? email : "");
        Toast.makeText(this, getString(R.string.welcome_user_fmt, getString(R.string.app_name), display), Toast.LENGTH_SHORT).show();
        startActivity(new Intent(this, MainActivity.class));
        finish();
    }
}

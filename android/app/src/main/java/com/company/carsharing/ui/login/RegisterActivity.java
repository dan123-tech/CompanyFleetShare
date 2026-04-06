package com.company.carsharing.ui.login;

import android.content.Intent;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.View;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;

import com.company.carsharing.R;
import com.company.carsharing.data.repository.AuthRepository;
import com.company.carsharing.databinding.ActivityRegisterBinding;
import com.company.carsharing.models.User;

/**
 * Register screen: name, email, password, confirm password.
 * On success, user can log in (or we could auto-login; backend register does not set session).
 */
public class RegisterActivity extends AppCompatActivity {

    private ActivityRegisterBinding binding;
    private AuthRepository authRepository;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        binding = ActivityRegisterBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());

        authRepository = new AuthRepository(this);

        binding.buttonRegister.setOnClickListener(v -> register());
        binding.linkLogin.setOnClickListener(v -> {
            startActivity(new Intent(this, LoginActivity.class));
            finish();
        });
    }

    private void register() {
        String name = binding.name.getText() != null ? binding.name.getText().toString().trim() : "";
        String email = binding.email.getText() != null ? binding.email.getText().toString().trim() : "";
        String password = binding.password.getText() != null ? binding.password.getText().toString() : "";
        String confirm = binding.confirmPassword.getText() != null ? binding.confirmPassword.getText().toString() : "";

        if (name.isEmpty()) {
            showError(getString(R.string.register_name_required));
            return;
        }
        if (email.isEmpty()) {
            showError(getString(R.string.register_email_required));
            return;
        }
        if (password.isEmpty()) {
            showError(getString(R.string.register_password_required));
            return;
        }
        if (password.length() < 8) {
            showError(getString(R.string.register_password_min));
            return;
        }
        if (!password.equals(confirm)) {
            showError(getString(R.string.register_passwords_mismatch));
            return;
        }

        binding.errorText.setVisibility(View.GONE);
        binding.progress.setVisibility(View.VISIBLE);
        binding.buttonRegister.setEnabled(false);

        authRepository.register(name, email, password, new AuthRepository.AuthCallback() {
            @Override
            public void onSuccess(User user) {
                runOnUiThread(() -> {
                    binding.progress.setVisibility(View.GONE);
                    binding.buttonRegister.setEnabled(true);
                    Toast.makeText(RegisterActivity.this, getString(R.string.account_created_login), Toast.LENGTH_LONG).show();
                    startActivity(new Intent(RegisterActivity.this, LoginActivity.class));
                    finish();
                });
            }

            @Override
            public void onError(String message) {
                runOnUiThread(() -> {
                    binding.progress.setVisibility(View.GONE);
                    binding.buttonRegister.setEnabled(true);
                    showError(message != null ? message : getString(R.string.registration_failed));
                });
            }
        });
    }

    private void showError(String msg) {
        if (binding != null) {
            binding.errorText.setVisibility(View.VISIBLE);
            binding.errorText.setText(msg);
        }
    }
}

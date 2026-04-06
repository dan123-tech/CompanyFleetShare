package com.company.carsharing.ui;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.Fragment;

import com.company.carsharing.R;
import com.company.carsharing.data.repository.AuthRepository;
import com.company.carsharing.databinding.FragmentMyReservationsBinding;
import com.company.carsharing.models.Car;
import com.company.carsharing.models.Reservation;
import com.company.carsharing.models.User;
import com.company.carsharing.network.RetrofitClient;
import com.company.carsharing.reminders.ReservationAlarmScheduler;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class MyReservationsFragment extends Fragment implements ReservationsAdapter.OnReservationActionListener {
    private FragmentMyReservationsBinding binding;
    private ReservationsAdapter adapter;

    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState) {
        binding = FragmentMyReservationsBinding.inflate(inflater, container, false);
        if (getActivity() instanceof MainActivity) ((MainActivity) getActivity()).setToolbarTitle(getString(R.string.nav_my_reservations));
        adapter = new ReservationsAdapter(requireContext(), this);
        binding.reservationsList.setAdapter(adapter);
        binding.fabNewReservation.setOnClickListener(v -> ReservationScheduleDialog.show(this, null, this::loadReservations));
        loadReservations();
        return binding.getRoot();
    }

    @Override
    public void onRelease(Reservation r) {
        int fallbackKm = r.getCar() != null ? r.getCar().getKm() : 0;
        AuthRepository authRepo = new AuthRepository(requireContext());
        RetrofitClient.getApiService(authRepo.getSessionPreferences())
                .getCar(r.getCarId())
                .enqueue(new Callback<Car>() {
                    @Override
                    public void onResponse(@NonNull Call<Car> call, @NonNull Response<Car> response) {
                        int km = fallbackKm;
                        if (response.isSuccessful() && response.body() != null) {
                            km = response.body().getKm();
                        }
                        if (getActivity() == null) return;
                        showReleaseReservationDialog(r, km);
                    }

                    @Override
                    public void onFailure(@NonNull Call<Car> call, @NonNull Throwable t) {
                        if (getActivity() == null) return;
                        showReleaseReservationDialog(r, fallbackKm);
                    }
                });
    }

    private void showReleaseReservationDialog(Reservation r, int lastKnownKm) {
        View dialogView = LayoutInflater.from(requireContext()).inflate(R.layout.dialog_release_reservation, null);
        TextView currentKmTv = dialogView.findViewById(R.id.dialog_release_current_km);
        currentKmTv.setText(getString(R.string.last_known_odometer_fmt, lastKnownKm));
        com.google.android.material.textfield.TextInputEditText newKmEt = dialogView.findViewById(R.id.dialog_release_new_km_et);
        newKmEt.setText(String.valueOf(lastKnownKm));
        com.google.android.material.textfield.TextInputEditText reasonEt = dialogView.findViewById(R.id.dialog_release_reason_et);
        TextView errorTv = dialogView.findViewById(R.id.dialog_release_error);
        View cancelBtn = dialogView.findViewById(R.id.dialog_release_cancel);
        View saveBtn = dialogView.findViewById(R.id.dialog_release_save);

        AlertDialog dialog = new AlertDialog.Builder(requireContext()).setView(dialogView).setCancelable(true).create();
        cancelBtn.setOnClickListener(v -> dialog.dismiss());
        saveBtn.setOnClickListener(v -> {
            errorTv.setVisibility(View.GONE);
            String newKmStr = newKmEt.getText() != null ? newKmEt.getText().toString().trim() : "";
            int newKm;
            try {
                newKm = Integer.parseInt(newKmStr);
            } catch (NumberFormatException e) {
                errorTv.setText(getString(R.string.enter_valid_odometer));
                errorTv.setVisibility(View.VISIBLE);
                return;
            }
            if (newKm < lastKnownKm) {
                errorTv.setText(getString(R.string.odometer_must_be_ge_fmt, lastKnownKm));
                errorTv.setVisibility(View.VISIBLE);
                return;
            }
            String reason = reasonEt.getText() != null ? reasonEt.getText().toString().trim() : "";
            Map<String, Object> body = new HashMap<>();
            body.put("action", "release");
            body.put("newKm", newKm);
            if (!reason.isEmpty()) body.put("exceededReason", reason);
            RetrofitClient.getApiService(new AuthRepository(requireContext()).getSessionPreferences())
                    .updateReservation(r.getId(), body).enqueue(new Callback<Map<String, Object>>() {
                        @Override
                        public void onResponse(@NonNull Call<Map<String, Object>> call, @NonNull Response<Map<String, Object>> response) {
                            if (getActivity() == null) return;
                            if (response.isSuccessful()) {
                                dialog.dismiss();
                                loadReservations();
                                Toast.makeText(requireContext(), getString(R.string.car_released), Toast.LENGTH_SHORT).show();
                            } else {
                                String apiErr = parseApiErrorMessage(response);
                                errorTv.setText(apiErr != null ? apiErr : (response.code() == 422
                                        ? getString(R.string.invalid_km_or_reason) : getString(R.string.failed_to_release)));
                                errorTv.setVisibility(View.VISIBLE);
                            }
                        }

                        @Override
                        public void onFailure(@NonNull Call<Map<String, Object>> call, @NonNull Throwable t) {
                            if (getActivity() != null) {
                                errorTv.setText(getString(R.string.network_error));
                                errorTv.setVisibility(View.VISIBLE);
                            }
                        }
                    });
        });
        dialog.show();
    }

    private static String parseApiErrorMessage(Response<?> response) {
        try {
            if (response.errorBody() == null) return null;
            String raw = response.errorBody().string();
            JsonObject o = JsonParser.parseString(raw).getAsJsonObject();
            if (o.has("error") && !o.get("error").isJsonNull()) {
                return o.get("error").getAsString();
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    @Override
    public void onRequestCodes(Reservation r) {
        Map<String, Object> body = new HashMap<>();
        body.put("action", "refreshCodes");
        RetrofitClient.getApiService(new AuthRepository(requireContext()).getSessionPreferences())
                .updateReservation(r.getId(), body).enqueue(new Callback<Map<String, Object>>() {
            @Override
            public void onResponse(Call<Map<String, Object>> call, Response<Map<String, Object>> response) {
                if (getActivity() != null) {
                    if (response.isSuccessful()) {
                        loadReservations();
                        Toast.makeText(requireContext(), getString(R.string.codes_updated), Toast.LENGTH_SHORT).show();
                    } else {
                        String msg = getString(R.string.could_not_get_codes);
                        try {
                            if (response.errorBody() != null) {
                                String body = response.errorBody().string();
                                if (body != null && body.contains("error")) {
                                    int i = body.indexOf("\"error\":\"");
                                    if (i >= 0) {
                                        int j = body.indexOf("\"", i + 9);
                                        if (j > i + 9) msg = body.substring(i + 9, j);
                                    }
                                }
                            }
                        } catch (Exception ignored) { }
                        Toast.makeText(requireContext(), msg, Toast.LENGTH_SHORT).show();
                    }
                }
            }
            @Override
            public void onFailure(Call<Map<String, Object>> call, Throwable t) {
                if (getActivity() != null) Toast.makeText(requireContext(), getString(R.string.network_error), Toast.LENGTH_SHORT).show();
            }
        });
    }

    @Override
    public void onCancel(Reservation r) {
        new AlertDialog.Builder(requireContext())
                .setTitle(R.string.cancel_reservation_title)
                .setMessage(R.string.cancel_reservation_message)
                .setPositiveButton(R.string.cancel_reservation_confirm, (d, w) -> {
                    Map<String, Object> body = new HashMap<>();
                    body.put("action", "cancel");
                    RetrofitClient.getApiService(new AuthRepository(requireContext()).getSessionPreferences())
                            .updateReservation(r.getId(), body).enqueue(new Callback<Map<String, Object>>() {
                        @Override
                        public void onResponse(Call<Map<String, Object>> call, Response<Map<String, Object>> response) {
                            if (getActivity() != null) {
                                if (response.isSuccessful()) {
                                    loadReservations();
                                    Toast.makeText(requireContext(), getString(R.string.reservation_cancelled), Toast.LENGTH_SHORT).show();
                                } else {
                                    Toast.makeText(requireContext(), getString(R.string.failed_to_cancel), Toast.LENGTH_SHORT).show();
                                }
                            }
                        }
                        @Override
                        public void onFailure(Call<Map<String, Object>> call, Throwable t) {
                            if (getActivity() != null) Toast.makeText(requireContext(), getString(R.string.network_error), Toast.LENGTH_SHORT).show();
                        }
                    });
                })
                .setNegativeButton(R.string.keep_reservation, null)
                .show();
    }

    private void loadReservations() {
        RetrofitClient.getApiService(new AuthRepository(requireContext()).getSessionPreferences())
                .getReservations(null, "1").enqueue(new Callback<List<Reservation>>() {
            @Override
            public void onResponse(Call<List<Reservation>> call, Response<List<Reservation>> response) {
                if (response.isSuccessful() && response.body() != null) {
                    adapter.setReservations(response.body());
                    binding.emptyText.setVisibility(response.body().isEmpty() ? View.VISIBLE : View.GONE);
                    if (Build.VERSION.SDK_INT >= 33
                            && ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                        requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1001);
                    }
                    AuthRepository repo = new AuthRepository(requireContext());
                    User u = repo.getSessionPreferences().getUser();
                    if (u != null && u.getId() != null) {
                        ReservationAlarmScheduler.schedule(requireContext(), response.body(), u.getId());
                    }
                }
            }
            @Override
            public void onFailure(Call<List<Reservation>> call, Throwable t) { }
        });
    }
}

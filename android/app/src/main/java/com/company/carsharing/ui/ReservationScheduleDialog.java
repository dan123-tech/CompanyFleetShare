package com.company.carsharing.ui;

import android.app.DatePickerDialog;
import android.app.TimePickerDialog;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.TextView;

import com.google.android.material.textfield.MaterialAutoCompleteTextView;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.fragment.app.Fragment;

import com.company.carsharing.R;
import com.company.carsharing.data.repository.AuthRepository;
import com.company.carsharing.models.Car;
import com.company.carsharing.models.Reservation;
import com.company.carsharing.models.User;
import com.company.carsharing.network.ApiService;
import com.company.carsharing.network.RetrofitClient;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Calendar;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

/**
 * Shared dialog: instant reserve or scheduled (start/end) reservation, matching POST /api/reservations.
 * {@code fixedCar != null}: opened from Available Cars (car picker hidden).
 * {@code fixedCar == null}: opened from My Reservations FAB (load available cars, show spinner).
 */
public final class ReservationScheduleDialog {

    private ReservationScheduleDialog() {}

    public interface DateTimeCallback {
        void onPicked(int year, int month, int day, int hour, int minute);
    }

    private static SimpleDateFormat isoFormat() {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f;
    }

    public static void pickDateTime(android.content.Context context, long initialMs, DateTimeCallback callback) {
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(initialMs);
        DatePickerDialog dateDialog = new DatePickerDialog(context, (view, year, month, dayOfMonth) -> {
            TimePickerDialog timeDialog = new TimePickerDialog(context,
                    (v, hour, minute) -> callback.onPicked(year, month, dayOfMonth, hour, minute),
                    cal.get(Calendar.HOUR_OF_DAY), cal.get(Calendar.MINUTE), true);
            timeDialog.show();
        }, cal.get(Calendar.YEAR), cal.get(Calendar.MONTH), cal.get(Calendar.DAY_OF_MONTH));
        dateDialog.show();
    }

    /** API returns ISO-8601; show in device local time for instant booking end cap (API 24+ safe). */
    private static String formatIsoEndLocal(String iso) {
        if (iso == null || iso.isEmpty()) return null;
        String[] patterns = {
                "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
                "yyyy-MM-dd'T'HH:mm:ss.SSSX",
                "yyyy-MM-dd'T'HH:mm:ss'Z'",
                "yyyy-MM-dd'T'HH:mm:ssX",
        };
        for (String p : patterns) {
            try {
                SimpleDateFormat parse = new SimpleDateFormat(p, Locale.US);
                if (p.contains("'Z'") && !p.contains("X")) {
                    parse.setTimeZone(TimeZone.getTimeZone("UTC"));
                }
                Date d = parse.parse(iso);
                if (d != null) {
                    SimpleDateFormat out = new SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.getDefault());
                    return out.format(d);
                }
            } catch (ParseException ignored) {
            }
        }
        return null;
    }

    /** Parse API ISO timestamps to UTC millis; same patterns as {@link #formatIsoEndLocal(String)}. */
    private static Long parseIsoUtcMillis(String iso) {
        if (iso == null || iso.isEmpty()) return null;
        String[] patterns = {
                "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
                "yyyy-MM-dd'T'HH:mm:ss.SSSX",
                "yyyy-MM-dd'T'HH:mm:ss'Z'",
                "yyyy-MM-dd'T'HH:mm:ssX",
        };
        for (String p : patterns) {
            try {
                SimpleDateFormat parse = new SimpleDateFormat(p, Locale.US);
                if (p.contains("'Z'") && !p.contains("X")) {
                    parse.setTimeZone(TimeZone.getTimeZone("UTC"));
                }
                Date d = parse.parse(iso);
                if (d != null) return d.getTime();
            } catch (ParseException ignored) {
            }
        }
        return null;
    }

    /** Half-open overlap: [aStart, aEnd) vs [bStart, bEnd) — matches server reservation overlap checks. */
    private static boolean intervalsOverlap(long aStart, long aEnd, long bStart, long bEnd) {
        return aStart < bEnd && bStart < aEnd;
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

    public static void show(Fragment fragment, Car fixedCar, Runnable onSuccess) {
        if (fragment.getContext() == null) return;
        android.content.Context ctx = fragment.requireContext();
        View dialogView = LayoutInflater.from(ctx).inflate(R.layout.dialog_create_reservation, null);
        TextView titleTv = dialogView.findViewById(R.id.dialog_res_title);
        View carSection = dialogView.findViewById(R.id.dialog_res_car_section);
        MaterialAutoCompleteTextView carDropdown = dialogView.findViewById(R.id.dialog_res_car);
        com.google.android.material.textfield.TextInputEditText purposeEt = dialogView.findViewById(R.id.dialog_res_purpose_et);
        com.google.android.material.textfield.TextInputEditText startEt = dialogView.findViewById(R.id.dialog_res_start);
        com.google.android.material.textfield.TextInputEditText endEt = dialogView.findViewById(R.id.dialog_res_end);
        TextView errorTv = dialogView.findViewById(R.id.dialog_res_error);
        View cancelBtn = dialogView.findViewById(R.id.dialog_res_cancel);
        View saveBtn = dialogView.findViewById(R.id.dialog_res_save);

        final long[] startMs = { 0 };
        final long[] endMs = { 0 };
        SimpleDateFormat displayFmt = new SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.getDefault());

        View.OnClickListener pickStart = v -> pickDateTime(ctx, startMs[0] > 0 ? startMs[0] : System.currentTimeMillis(),
                (year, month, day, hour, minute) -> {
                    Calendar c = Calendar.getInstance();
                    c.set(year, month, day, hour, minute, 0);
                    c.set(Calendar.MILLISECOND, 0);
                    startMs[0] = c.getTimeInMillis();
                    if (startEt != null) startEt.setText(displayFmt.format(c.getTime()));
                });
        View.OnClickListener pickEnd = v -> pickDateTime(ctx, endMs[0] > 0 ? endMs[0] : (startMs[0] > 0 ? startMs[0] + 3600000 : System.currentTimeMillis() + 3600000),
                (year, month, day, hour, minute) -> {
                    Calendar c = Calendar.getInstance();
                    c.set(year, month, day, hour, minute, 0);
                    c.set(Calendar.MILLISECOND, 0);
                    endMs[0] = c.getTimeInMillis();
                    if (endEt != null) endEt.setText(displayFmt.format(c.getTime()));
                });
        if (startEt != null) startEt.setOnClickListener(pickStart);
        if (endEt != null) endEt.setOnClickListener(pickEnd);

        if (fixedCar != null) {
            carSection.setVisibility(View.GONE);
            String cat = fixedCar.getVehicleCategory() != null && !fixedCar.getVehicleCategory().trim().isEmpty()
                    ? fixedCar.getVehicleCategory().trim()
                    : null;
            String carLabel = fixedCar.getBrand()
                    + (fixedCar.getModel() != null && !fixedCar.getModel().isEmpty() ? " " + fixedCar.getModel() : "")
                    + (fixedCar.getRegistrationNumber() != null ? " · " + fixedCar.getRegistrationNumber() : "")
                    + (cat != null ? " · " + cat : "");
            titleTv.setText(ctx.getString(R.string.reserve_car_title_fmt, carLabel));
            carDropdown.setAdapter(new ArrayAdapter<>(ctx, android.R.layout.simple_dropdown_item_1line,
                    Collections.singletonList(carLabel)));
            carDropdown.setText(carLabel, false);
            openDialogWithCars(fragment, dialogView, Collections.singletonList(fixedCar), errorTv, cancelBtn, saveBtn,
                    purposeEt, startMs, endMs, onSuccess);
            return;
        }

        titleTv.setText(R.string.new_reservation_title);
        RetrofitClient.getApiService(new AuthRepository(ctx).getSessionPreferences())
                .getCars("AVAILABLE").enqueue(new Callback<List<Car>>() {
                    @Override
                    public void onResponse(Call<List<Car>> call, Response<List<Car>> response) {
                        if (fragment.getActivity() == null) return;
                        if (!response.isSuccessful() || response.body() == null) return;
                        List<Car> cars = response.body();
                        if (cars.isEmpty()) {
                            Toast.makeText(ctx, ctx.getString(R.string.no_available_cars), Toast.LENGTH_SHORT).show();
                            return;
                        }
                        List<String> labels = new ArrayList<>();
                        for (Car c : cars) {
                            String cat = c.getVehicleCategory() != null && !c.getVehicleCategory().trim().isEmpty()
                                    ? c.getVehicleCategory().trim()
                                    : null;
                            labels.add(
                                    c.getBrand() + " " +
                                            (c.getRegistrationNumber() != null ? c.getRegistrationNumber() : c.getId()) +
                                            (cat != null ? " · " + cat : "")
                            );
                        }
                        carDropdown.setAdapter(new ArrayAdapter<>(ctx, android.R.layout.simple_dropdown_item_1line, labels));
                        if (!labels.isEmpty()) carDropdown.setText(labels.get(0), false);
                        openDialogWithCars(fragment, dialogView, cars, errorTv, cancelBtn, saveBtn, purposeEt, startMs, endMs, onSuccess);
                    }

                    @Override
                    public void onFailure(Call<List<Car>> call, Throwable t) {
                        if (fragment.getActivity() != null) {
                            Toast.makeText(ctx, ctx.getString(R.string.failed_load_cars), Toast.LENGTH_SHORT).show();
                        }
                    }
                });
    }

    private static void openDialogWithCars(Fragment fragment, View dialogView, List<Car> cars,
            TextView errorTv, View cancelBtn, View saveBtn,
            com.google.android.material.textfield.TextInputEditText purposeEt,
            long[] startMs, long[] endMs, Runnable onSuccess) {
        android.content.Context ctx = fragment.requireContext();
        MaterialAutoCompleteTextView carDropdown2 = dialogView.findViewById(R.id.dialog_res_car);
        AlertDialog dialog = new AlertDialog.Builder(ctx).setView(dialogView).setCancelable(true).create();
        cancelBtn.setOnClickListener(v -> dialog.dismiss());
        saveBtn.setOnClickListener(v -> {
            errorTv.setVisibility(View.GONE);
            String selectedText = carDropdown2 != null && carDropdown2.getText() != null ? carDropdown2.getText().toString() : "";
            // resolve car by matching adapter text
            ArrayAdapter<String> ad = carDropdown2 != null ? (ArrayAdapter<String>) carDropdown2.getAdapter() : null;
            int pos = -1;
            if (ad != null) {
                for (int i = 0; i < ad.getCount(); i++) {
                    if (selectedText.equals(ad.getItem(i))) { pos = i; break; }
                }
            }
            if (pos < 0 && !cars.isEmpty()) pos = 0;
            if (pos < 0 || pos >= cars.size()) {
                errorTv.setText(ctx.getString(R.string.select_a_car));
                errorTv.setVisibility(View.VISIBLE);
                return;
            }
            Car selected = cars.get(pos);
            String purpose = purposeEt.getText() != null ? purposeEt.getText().toString().trim() : "";
            final boolean scheduled = startMs[0] > 0 && endMs[0] > 0;
            Map<String, Object> body = new HashMap<>();
            body.put("carId", selected.getId());
            if (!purpose.isEmpty()) body.put("purpose", purpose);
            if (scheduled) {
                if (endMs[0] <= startMs[0]) {
                    errorTv.setText(ctx.getString(R.string.end_after_start));
                    errorTv.setVisibility(View.VISIBLE);
                    return;
                }
                long nowMs = System.currentTimeMillis();
                if (startMs[0] < nowMs) {
                    errorTv.setText(ctx.getString(R.string.start_must_be_future));
                    errorTv.setVisibility(View.VISIBLE);
                    return;
                }
                body.put("startDate", isoFormat().format(new java.util.Date(startMs[0])));
                body.put("endDate", isoFormat().format(new java.util.Date(endMs[0])));
            }
            AuthRepository authRepo = new AuthRepository(ctx);
            ApiService api = RetrofitClient.getApiService(authRepo.getSessionPreferences());
            User sessionUser = authRepo.getSessionPreferences().getUser();
            final String myUserId = sessionUser != null ? sessionUser.getId() : null;
            saveBtn.setEnabled(false);
            if (scheduled) {
                final long slotStart = startMs[0];
                final long slotEnd = endMs[0];
                api.getReservations(null, null).enqueue(new Callback<List<Reservation>>() {
                    @Override
                    public void onResponse(Call<List<Reservation>> call, Response<List<Reservation>> response) {
                        if (fragment.getActivity() == null) {
                            saveBtn.setEnabled(true);
                            return;
                        }
                        if (myUserId != null && response.isSuccessful() && response.body() != null) {
                            for (Reservation r : response.body()) {
                                if (r.getUserId() == null || !myUserId.equals(r.getUserId())) continue;
                                if (r.getStatus() == null || !"ACTIVE".equalsIgnoreCase(r.getStatus())) continue;
                                Long rs = parseIsoUtcMillis(r.getStartDate());
                                Long re = parseIsoUtcMillis(r.getEndDate());
                                if (rs == null || re == null) continue;
                                if (intervalsOverlap(slotStart, slotEnd, rs, re)) {
                                    String msg = ctx.getString(R.string.reservation_user_time_overlap);
                                    errorTv.setText(msg);
                                    errorTv.setVisibility(View.VISIBLE);
                                    Toast.makeText(ctx, msg, Toast.LENGTH_LONG).show();
                                    saveBtn.setEnabled(true);
                                    return;
                                }
                            }
                        }
                        enqueueCreateReservation(fragment, ctx, api, body, dialog, scheduled, errorTv, saveBtn, onSuccess);
                    }

                    @Override
                    public void onFailure(Call<List<Reservation>> call, Throwable t) {
                        if (fragment.getActivity() == null) {
                            saveBtn.setEnabled(true);
                            return;
                        }
                        enqueueCreateReservation(fragment, ctx, api, body, dialog, scheduled, errorTv, saveBtn, onSuccess);
                    }
                });
            } else {
                enqueueCreateReservation(fragment, ctx, api, body, dialog, scheduled, errorTv, saveBtn, onSuccess);
            }
        });
        dialog.show();
    }

    /**
     * POST /api/reservations; re-enables save on completion and shows errors on {@code errorTv}.
     */
    private static void enqueueCreateReservation(
            Fragment fragment,
            android.content.Context ctx,
            ApiService api,
            Map<String, Object> body,
            AlertDialog dialog,
            boolean scheduled,
            TextView errorTv,
            View saveBtn,
            Runnable onSuccess) {
        api.createReservation(body).enqueue(new Callback<Reservation>() {
            @Override
            public void onResponse(Call<Reservation> call, Response<Reservation> response) {
                if (fragment.getActivity() == null) return;
                saveBtn.setEnabled(true);
                if (response.isSuccessful() && response.body() != null) {
                    Reservation created = response.body();
                    dialog.dismiss();
                    String toastMsg;
                    if (scheduled) {
                        toastMsg = ctx.getString(R.string.reservation_created_scheduled);
                    } else {
                        String endIso = created.getEndDate();
                        String endLocal = formatIsoEndLocal(endIso);
                        toastMsg = endLocal != null && !endLocal.isEmpty()
                                ? ctx.getString(R.string.reservation_created_instant_until, endLocal)
                                : ctx.getString(R.string.reservation_created_instant);
                    }
                    Toast.makeText(ctx, toastMsg, Toast.LENGTH_LONG).show();
                    if (onSuccess != null) onSuccess.run();
                    return;
                }
                String apiErr = parseApiErrorMessage(response);
                errorTv.setText(apiErr != null ? apiErr
                        : (response.code() == 400 ? ctx.getString(R.string.reservation_invalid_request)
                        : ctx.getString(R.string.failed_create_reservation)));
                errorTv.setVisibility(View.VISIBLE);
            }

            @Override
            public void onFailure(Call<Reservation> call, Throwable t) {
                if (fragment.getActivity() == null) return;
                saveBtn.setEnabled(true);
                String msg = t.getMessage() != null ? t.getMessage() : ctx.getString(R.string.network_error);
                errorTv.setText(msg);
                errorTv.setVisibility(View.VISIBLE);
            }
        });
    }
}

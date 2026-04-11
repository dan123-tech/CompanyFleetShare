package com.company.carsharing.reminders;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import com.company.carsharing.models.Reservation;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;

/**
 * Schedules exact-time local alarms for ACTIVE reservation start/end (user's own bookings).
 * Skips "until released" style bookings (end &gt; 14 days after start).
 */
public final class ReservationAlarmScheduler {

    private static final String PREFS = "booking_alarm_scheduler";
    private static final String KEY_KEYS = "alarm_keys";
    private static final long MAX_SPAN_MS = 14L * 24 * 60 * 60 * 1000;
    /** Local notification ~15 minutes before reservation start (matches web / server FCM intent). */
    private static final long BEFORE_START_MS = 15L * 60 * 1000;
    private static final String TAG = "ReservationAlarms";

    private ReservationAlarmScheduler() {}

    public static void cancelAll(Context context) {
        SharedPreferences prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        Set<String> old = prefs.getStringSet(KEY_KEYS, null);
        if (old == null || old.isEmpty()) return;
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        for (String key : old) {
            cancelOne(context, am, key);
        }
        prefs.edit().remove(KEY_KEYS).apply();
    }

    private static void cancelOne(Context context, AlarmManager am, String key) {
        int reqCode = (key.hashCode() & 0x7fffffff);
        PendingIntent pi = buildOperation(context, key, reqCode, "", "", false);
        if (pi != null) {
            am.cancel(pi);
            pi.cancel();
        }
    }

    /**
     * Replace previous alarms and schedule for the given list (typically "my" reservations).
     */
    public static void schedule(Context context, List<Reservation> reservations, String currentUserId) {
        Context app = context.getApplicationContext();
        cancelAll(app);

        if (reservations == null || currentUserId == null) return;

        AlarmManager am = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        long now = System.currentTimeMillis();
        Set<String> newKeys = new HashSet<>();

        for (Reservation r : reservations) {
            if (r == null || r.getId() == null || r.getUserId() == null) continue;
            if (!currentUserId.equals(r.getUserId())) continue;
            if (!"ACTIVE".equalsIgnoreCase(r.getStatus())) continue;
            try {
                long startMs = parseIsoToMillis(r.getStartDate());
                long endMs = parseIsoToMillis(r.getEndDate());
                if (startMs <= 0 || endMs <= 0) continue;

                boolean longBooking = (endMs - startMs) > MAX_SPAN_MS;
                String carLabel = buildCarLabel(r);
                String pickup = r.getPickupCode() != null ? r.getPickupCode().trim() : "";

                long beforeAt = startMs - BEFORE_START_MS;
                if (beforeAt > now) {
                    String key = r.getId() + ":before15";
                    String title = app.getString(com.company.carsharing.R.string.booking_before_15_title);
                    String body = carLabel.isEmpty()
                            ? app.getString(com.company.carsharing.R.string.booking_before_15_body)
                            : app.getString(com.company.carsharing.R.string.booking_before_15_body_car, carLabel);
                    scheduleOne(app, am, newKeys, key, beforeAt, title, body);
                }

                if (startMs > now) {
                    String key = r.getId() + ":start";
                    String title = app.getString(com.company.carsharing.R.string.booking_start_title);
                    String body;
                    if (!pickup.isEmpty()) {
                        body = carLabel.isEmpty()
                                ? app.getString(com.company.carsharing.R.string.booking_start_body_with_code, pickup)
                                : app.getString(com.company.carsharing.R.string.booking_start_body_car_with_code, carLabel, pickup);
                    } else {
                        body = carLabel.isEmpty()
                                ? app.getString(com.company.carsharing.R.string.booking_start_body)
                                : app.getString(com.company.carsharing.R.string.booking_start_body_car, carLabel);
                    }
                    scheduleOne(app, am, newKeys, key, startMs, title, body);
                }

                if (!longBooking && endMs > now) {
                    String key = r.getId() + ":end";
                    scheduleOne(app, am, newKeys, key, endMs,
                            app.getString(com.company.carsharing.R.string.booking_end_title),
                            carLabel.isEmpty()
                                    ? app.getString(com.company.carsharing.R.string.booking_end_body)
                                    : app.getString(com.company.carsharing.R.string.booking_end_body_car, carLabel));
                }
            } catch (RuntimeException ex) {
                Log.w(TAG, "Skip alarms for reservation " + r.getId(), ex);
            }
        }

        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putStringSet(KEY_KEYS, newKeys)
                .apply();
    }

    private static String buildCarLabel(Reservation r) {
        if (r.getCar() == null) return "";
        String b = r.getCar().getBrand() != null ? r.getCar().getBrand() : "";
        String reg = r.getCar().getRegistrationNumber() != null ? r.getCar().getRegistrationNumber() : "";
        String m = r.getCar().getModel() != null ? r.getCar().getModel() : "";
        String joined = (b + " " + m).trim();
        if (!reg.isEmpty()) {
            return joined.isEmpty() ? reg : joined + " (" + reg + ")";
        }
        return joined;
    }

    private static void scheduleOne(Context app, AlarmManager am, Set<String> newKeys, String key, long whenMs, String title, String body) {
        int reqCode = (key.hashCode() & 0x7fffffff);
        PendingIntent op = buildOperation(app, key, reqCode, title, body, true);
        if (op == null) return;

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                Intent show = new Intent(app, com.company.carsharing.ui.MainActivity.class);
                show.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                PendingIntent showPi = PendingIntent.getActivity(
                        app,
                        reqCode + 100000,
                        show,
                        PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
                );
                AlarmManager.AlarmClockInfo info = new AlarmManager.AlarmClockInfo(whenMs, showPi);
                am.setAlarmClock(info, op);
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, whenMs, op);
            }
            newKeys.add(key);
        } catch (Exception e) {
            Log.w(TAG, "Could not schedule alarm for " + key, e);
        }
    }

    private static PendingIntent buildOperation(Context app, String key, int reqCode, String title, String body, boolean create) {
        Intent intent = new Intent(app, BookingReminderReceiver.class);
        intent.putExtra(BookingReminderReceiver.EXTRA_TITLE, title);
        intent.putExtra(BookingReminderReceiver.EXTRA_BODY, body);
        intent.putExtra(BookingReminderReceiver.EXTRA_NOTIFICATION_ID, reqCode);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        if (!create) {
            flags |= PendingIntent.FLAG_NO_CREATE;
        }
        return PendingIntent.getBroadcast(app, reqCode, intent, flags);
    }

    /** Parse API ISO date strings to epoch ms (UTC). */
    public static long parseIsoToMillis(String iso) {
        if (iso == null || iso.isEmpty()) return -1;
        String[] patterns = {
                "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
                "yyyy-MM-dd'T'HH:mm:ss'Z'",
                "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
                "yyyy-MM-dd'T'HH:mm:ssXXX",
        };
        for (String p : patterns) {
            try {
                SimpleDateFormat f = new SimpleDateFormat(p, Locale.US);
                if (p.endsWith("'Z'") || p.contains("SSS'Z'")) {
                    f.setTimeZone(TimeZone.getTimeZone("UTC"));
                }
                return f.parse(iso).getTime();
            } catch (ParseException ignored) {
            }
        }
        Log.d(TAG, "Bad date: " + iso);
        return -1;
    }
}

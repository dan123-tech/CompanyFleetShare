package com.company.carsharing.ui;

import android.content.Context;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.TextView;

import com.company.carsharing.R;
import com.company.carsharing.models.Reservation;
import com.company.carsharing.reminders.ReservationAlarmScheduler;
import com.company.carsharing.util.I18n;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

public class ReservationsAdapter extends BaseAdapter {
    private final Context context;
    private final List<Reservation> reservations = new ArrayList<>();
    private final OnReservationActionListener listener;

    public interface OnReservationActionListener {
        void onRelease(Reservation r);
        void onCancel(Reservation r);
        void onRequestCodes(Reservation r);
    }

    public ReservationsAdapter(Context context, OnReservationActionListener listener) {
        this.context = context;
        this.listener = listener;
    }

    public void setReservations(List<Reservation> reservations) {
        this.reservations.clear();
        if (reservations != null) this.reservations.addAll(reservations);
        notifyDataSetChanged();
    }

    @Override
    public int getCount() { return reservations.size(); }
    @Override
    public Reservation getItem(int position) { return reservations.get(position); }
    @Override
    public long getItemId(int position) { return position; }

    @Override
    public View getView(int position, View convertView, ViewGroup parent) {
        View row = convertView;
        if (row == null) {
            row = LayoutInflater.from(context).inflate(R.layout.item_reservation, parent, false);
        }
        Reservation r = reservations.get(position);
        String brand = (r.getCar() != null && r.getCar().getBrand() != null) ? r.getCar().getBrand() : "";
        String reg = (r.getCar() != null && r.getCar().getRegistrationNumber() != null) ? r.getCar().getRegistrationNumber() : "";
        String carStr = r.getCar() != null ? (brand + " " + reg).trim() : context.getString(R.string.history_fallback_car);
        if (carStr.isEmpty()) carStr = context.getString(R.string.history_fallback_car);
        String statusLabel = I18n.reservationStatus(context, r.getStatus());
        TextView titleTv = row.findViewById(R.id.res_title);
        TextView subtitleTv = row.findViewById(R.id.res_subtitle);
        TextView pickupTv = row.findViewById(R.id.res_pickup_code);
        TextView releaseTv = row.findViewById(R.id.res_release_code);
        if (titleTv == null || subtitleTv == null || pickupTv == null || releaseTv == null) return row;
        titleTv.setText(carStr + " · " + statusLabel);
        String sub = (r.getPurpose() != null && !r.getPurpose().isEmpty() ? r.getPurpose() : "")
                + (r.getCar() != null ? " · " + context.getString(R.string.km_suffix_fmt, r.getCar().getKm()) : "");
        if (r.getStartDate() != null || r.getEndDate() != null) {
            String dates = formatDateRange(r.getStartDate(), r.getEndDate());
            if (!dates.isEmpty()) sub = sub.isEmpty() ? dates : sub + " · " + dates;
        }
        subtitleTv.setText(sub);
        String dash = context.getString(R.string.em_dash);
        String pickup = r.getPickupCode() != null ? r.getPickupCode() : dash;
        String release = r.getReleaseCode() != null ? r.getReleaseCode() : dash;
        pickupTv.setText(pickup);
        releaseTv.setText(release);
        String codeStatus = getCodeTimerStatus(context, r);
        TextView timerTv = row.findViewById(R.id.res_code_timer);
        if (timerTv != null) {
            timerTv.setText(codeStatus);
            timerTv.setVisibility(codeStatus.isEmpty() ? android.view.View.GONE : android.view.View.VISIBLE);
        }
        boolean active = "ACTIVE".equalsIgnoreCase(r.getStatus());
        boolean missingCodes = active && r.getPickupCode() == null;
        View getCodesBtn = row.findViewById(R.id.res_get_codes);
        if (getCodesBtn != null) {
            getCodesBtn.setVisibility(missingCodes ? View.VISIBLE : View.GONE);
            getCodesBtn.setOnClickListener(v -> listener.onRequestCodes(r));
        }
        View releaseBtn = row.findViewById(R.id.res_release);
        View cancelBtn = row.findViewById(R.id.res_cancel);
        if (releaseBtn != null && cancelBtn != null) {
            releaseBtn.setVisibility(active ? View.VISIBLE : View.GONE);
            cancelBtn.setVisibility(active ? View.VISIBLE : View.GONE);
            releaseBtn.setOnClickListener(v -> listener.onRelease(r));
            cancelBtn.setOnClickListener(v -> listener.onCancel(r));
        }
        return row;
    }

    private String formatDateRange(String start, String end) {
        if (start == null && end == null) return "";
        try {
            java.text.SimpleDateFormat iso = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
            iso.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
            java.text.SimpleDateFormat out = new java.text.SimpleDateFormat("dd/MM HH:mm", Locale.getDefault());
            StringBuilder sb = new StringBuilder();
            if (start != null && !start.isEmpty()) {
                String s = start.length() >= 19 ? start.substring(0, 19).replace("Z", "") : start.replace("Z", "");
                sb.append(out.format(iso.parse(s)));
            }
            if (end != null && !end.isEmpty()) {
                String e = end.length() >= 19 ? end.substring(0, 19).replace("Z", "") : end.replace("Z", "");
                if (sb.length() > 0) sb.append(" → ");
                sb.append(out.format(iso.parse(e)));
            }
            return sb.toString();
        } catch (Exception e) { return ""; }
    }

    /** 30-min code window: Pending (before valid), Active (valid now), Expired (after 30 min). */
    private String getCodeTimerStatus(Context ctx, Reservation r) {
        String validFrom = r.getCodeValidFrom();
        if (validFrom == null || validFrom.isEmpty()) return "";
        try {
            long fromMs = ReservationAlarmScheduler.parseIsoToMillis(validFrom);
            if (fromMs <= 0) return "";
            long now = System.currentTimeMillis();
            long windowMs = TimeUnit.MINUTES.toMillis(30);
            if (now < fromMs) return ctx.getString(R.string.code_valid_in_fmt, (int) ((fromMs - now) / 60000));
            if (now < fromMs + windowMs) return ctx.getString(R.string.code_valid_now_fmt, (int) ((fromMs + windowMs - now) / 60000));
            return ctx.getString(R.string.code_window_expired);
        } catch (Exception e) {
            return "";
        }
    }
}

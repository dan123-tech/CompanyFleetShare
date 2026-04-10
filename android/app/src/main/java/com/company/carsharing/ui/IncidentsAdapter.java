package com.company.carsharing.ui;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.company.carsharing.R;
import com.company.carsharing.models.IncidentReport;
import com.company.carsharing.util.DateTimeUi;

import java.util.ArrayList;
import java.util.List;

public class IncidentsAdapter extends RecyclerView.Adapter<IncidentsAdapter.VH> {
    private final List<IncidentReport> items = new ArrayList<>();

    public void setItems(List<IncidentReport> list) {
        items.clear();
        if (list != null) items.addAll(list);
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_incident, parent, false);
        return new VH(v);
    }

    @Override
    public void onBindViewHolder(@NonNull VH h, int position) {
        IncidentReport r = items.get(position);
        String sev = r.getSeverity() != null ? r.getSeverity().toUpperCase() : "C";
        h.severity.setText(sev);
        h.title.setText(r.getTitle() != null ? r.getTitle() : "—");
        String car = r.getCar() != null
                ? (safe(r.getCar().getBrand()) + " " + safe(r.getCar().getRegistrationNumber())).trim()
                : safe(r.getCarId());
        String status = safe(r.getStatus());
        String whenRaw = safe(r.getOccurredAt() != null ? r.getOccurredAt() : r.getCreatedAt());
        String when = DateTimeUi.format(whenRaw, h.itemView.getContext());
        h.sub.setText((car.isEmpty() ? "—" : car) + " • " + (status.isEmpty() ? "SUBMITTED" : status) + " • " + (when.isEmpty() ? "—" : when));
    }

    private static String safe(String s) { return s == null ? "" : s; }

    @Override
    public int getItemCount() { return items.size(); }

    static class VH extends RecyclerView.ViewHolder {
        TextView severity, title, sub;
        VH(@NonNull View itemView) {
            super(itemView);
            severity = itemView.findViewById(R.id.inc_item_severity);
            title = itemView.findViewById(R.id.inc_item_title);
            sub = itemView.findViewById(R.id.inc_item_sub);
        }
    }
}


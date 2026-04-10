package com.company.carsharing.ui;

import android.content.Context;
import android.net.Uri;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;

import com.company.carsharing.R;
import com.company.carsharing.data.repository.AuthRepository;
import com.company.carsharing.databinding.FragmentIncidentsBinding;
import com.company.carsharing.models.Car;
import com.company.carsharing.models.IncidentReport;
import com.company.carsharing.network.RetrofitClient;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import okhttp3.MediaType;
import okhttp3.MultipartBody;
import okhttp3.RequestBody;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class IncidentsFragment extends Fragment {
    private FragmentIncidentsBinding binding;
    private final List<Uri> pickedFiles = new ArrayList<>();
    private final Map<String, String> carLabelToId = new HashMap<>();
    /** Kept in sync when user picks from the vehicle dropdown; submit also resolves from field text. */
    private String selectedCarId = "";

    private IncidentsAdapter adapter;

    private ActivityResultLauncher<String[]> pickFilesLauncher;

    @Override
    public void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        pickFilesLauncher = registerForActivityResult(new ActivityResultContracts.OpenMultipleDocuments(), uris -> {
            if (uris == null) return;
            for (Uri u : uris) {
                if (u != null && !pickedFiles.contains(u)) pickedFiles.add(u);
            }
            if (binding != null) {
                binding.incFilesLabel.setText(pickedFiles.isEmpty()
                        ? getString(R.string.incidents_no_files)
                        : getString(R.string.incidents_files_count, pickedFiles.size()));
            }
        });
    }

    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState) {
        binding = FragmentIncidentsBinding.inflate(inflater, container, false);
        if (getActivity() instanceof MainActivity) ((MainActivity) getActivity()).setToolbarTitle(getString(R.string.nav_incidents));

        adapter = new IncidentsAdapter();
        binding.incList.setLayoutManager(new LinearLayoutManager(requireContext()));
        binding.incList.setAdapter(adapter);

        setupSeverityDropdown();
        loadCarsForDropdown();
        loadIncidents();

        binding.incAddFiles.setOnClickListener(v -> pickFilesLauncher.launch(new String[]{
                "image/*",
                "application/pdf",
                "application/msword",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        }));

        binding.incSubmit.setOnClickListener(v -> submitIncident());

        return binding.getRoot();
    }

    private void setupSeverityDropdown() {
        List<String> items = new ArrayList<>();
        items.add(getString(R.string.incident_severity_a));
        items.add(getString(R.string.incident_severity_b));
        items.add(getString(R.string.incident_severity_c));
        ArrayAdapter<String> ad = new ArrayAdapter<>(requireContext(), android.R.layout.simple_dropdown_item_1line, items);
        binding.incSeverity.setAdapter(ad);
        binding.incSeverity.setThreshold(0);
        binding.incSeverity.setText(items.get(2), false);
    }

    private String currentSeverityLetter() {
        String v = binding.incSeverity.getText() != null ? binding.incSeverity.getText().toString().trim() : "";
        if (v.startsWith("A") || v.startsWith("a")) return "A";
        if (v.startsWith("B") || v.startsWith("b")) return "B";
        return "C";
    }

    /** Resolves car id from the vehicle field (dropdown selection or exact label text). */
    private String resolveCarIdFromField() {
        String typed = binding.incVehicle.getText() != null ? binding.incVehicle.getText().toString().trim() : "";
        if (typed.isEmpty()) return "";
        String id = carLabelToId.get(typed);
        if (id != null) return id;
        for (Map.Entry<String, String> e : carLabelToId.entrySet()) {
            if (e.getKey().equalsIgnoreCase(typed)) return e.getValue();
        }
        return "";
    }

    private void loadCarsForDropdown() {
        RetrofitClient.getApiService(new AuthRepository(requireContext()).getSessionPreferences())
                .getAllCars().enqueue(new Callback<List<Car>>() {
                    @Override
                    public void onResponse(Call<List<Car>> call, Response<List<Car>> response) {
                        if (binding == null) return;
                        if (!response.isSuccessful() || response.body() == null) {
                            Toast.makeText(requireContext(), getString(R.string.could_not_load_cars_http, response.code()), Toast.LENGTH_SHORT).show();
                            return;
                        }
                        carLabelToId.clear();
                        List<String> labels = new ArrayList<>();
                        for (Car c : response.body()) {
                            String label = (safe(c.getBrand()) + " " + safe(c.getRegistrationNumber())).trim();
                            if (label.isEmpty()) label = safe(c.getId());
                            labels.add(label);
                            carLabelToId.put(label, c.getId());
                        }
                        ArrayAdapter<String> ad = new ArrayAdapter<>(requireContext(), android.R.layout.simple_dropdown_item_1line, labels);
                        binding.incVehicle.setAdapter(ad);
                        binding.incVehicle.setThreshold(0);
                        binding.incVehicle.setOnItemClickListener((parent, view, position, id) -> {
                            if (position >= 0 && position < labels.size()) {
                                String label = labels.get(position);
                                selectedCarId = carLabelToId.get(label) != null ? carLabelToId.get(label) : "";
                            }
                        });
                    }

                    @Override
                    public void onFailure(Call<List<Car>> call, Throwable t) {
                        if (binding == null) return;
                        Toast.makeText(requireContext(), t.getMessage() != null ? t.getMessage() : getString(R.string.check_connection), Toast.LENGTH_SHORT).show();
                    }
                });
    }

    private void loadIncidents() {
        RetrofitClient.getApiService(new AuthRepository(requireContext()).getSessionPreferences())
                .getIncidents().enqueue(new Callback<List<IncidentReport>>() {
                    @Override
                    public void onResponse(Call<List<IncidentReport>> call, Response<List<IncidentReport>> response) {
                        if (binding == null) return;
                        if (response.isSuccessful() && response.body() != null) {
                            adapter.setItems(response.body());
                            boolean empty = response.body().isEmpty();
                            binding.incEmpty.setVisibility(empty ? View.VISIBLE : View.GONE);
                            binding.incList.setVisibility(empty ? View.GONE : View.VISIBLE);
                        } else {
                            binding.incEmpty.setText(getString(R.string.network_error_fmt, String.valueOf(response.code())));
                            binding.incEmpty.setVisibility(View.VISIBLE);
                            binding.incList.setVisibility(View.GONE);
                        }
                    }

                    @Override
                    public void onFailure(Call<List<IncidentReport>> call, Throwable t) {
                        if (binding == null) return;
                        binding.incEmpty.setText(getString(R.string.network_error_fmt, t.getMessage() != null ? t.getMessage() : getString(R.string.check_connection)));
                        binding.incEmpty.setVisibility(View.VISIBLE);
                        binding.incList.setVisibility(View.GONE);
                    }
                });
    }

    private void submitIncident() {
        if (binding == null) return;
        String title = binding.incTitle.getText() != null ? binding.incTitle.getText().toString().trim() : "";
        String carIdResolved = resolveCarIdFromField();
        if (!carIdResolved.isEmpty()) {
            selectedCarId = carIdResolved;
        }
        if (selectedCarId == null || selectedCarId.trim().isEmpty() || title.isEmpty()) {
            showMessage(getString(R.string.incidents_require_car_title));
            return;
        }
        showMessage(getString(R.string.uploading));

        RequestBody carId = textBody(selectedCarId);
        RequestBody titleBody = textBody(title);
        RequestBody severityBody = textBody(currentSeverityLetter());
        RequestBody occurredAt = textBody(""); // optional
        RequestBody location = textBody(text(binding.incLocation));
        RequestBody description = textBody(text(binding.incDescription));

        List<MultipartBody.Part> parts = new ArrayList<>();
        for (Uri uri : pickedFiles) {
            MultipartBody.Part p = partFromUri(requireContext(), uri);
            if (p != null) parts.add(p);
        }

        RetrofitClient.getApiService(new AuthRepository(requireContext()).getSessionPreferences())
                .createIncident(carId, titleBody, severityBody, occurredAt, location, description, parts)
                .enqueue(new Callback<Map<String, Object>>() {
                    @Override
                    public void onResponse(Call<Map<String, Object>> call, Response<Map<String, Object>> response) {
                        if (binding == null) return;
                        if (response.isSuccessful()) {
                            showMessage(getString(R.string.incidents_submitted));
                            binding.incTitle.setText("");
                            binding.incLocation.setText("");
                            binding.incDescription.setText("");
                            binding.incVehicle.setText("", false);
                            selectedCarId = "";
                            binding.incSeverity.setText(getString(R.string.incident_severity_c), false);
                            pickedFiles.clear();
                            binding.incFilesLabel.setText(getString(R.string.incidents_no_files));
                            loadIncidents();
                        } else {
                            showMessage(getString(R.string.upload_failed));
                        }
                    }

                    @Override
                    public void onFailure(Call<Map<String, Object>> call, Throwable t) {
                        if (binding == null) return;
                        showMessage(t.getMessage() != null ? t.getMessage() : getString(R.string.error_generic));
                    }
                });
    }

    private void showMessage(String msg) {
        if (binding == null) return;
        binding.incMessage.setVisibility(View.VISIBLE);
        binding.incMessage.setText(msg);
    }

    private static String safe(String s) { return s == null ? "" : s; }

    private static String text(com.google.android.material.textfield.TextInputEditText v) {
        return v.getText() != null ? v.getText().toString().trim() : "";
    }

    private static RequestBody textBody(String s) {
        return RequestBody.create(MediaType.parse("text/plain"), s == null ? "" : s);
    }

    private static MultipartBody.Part partFromUri(Context ctx, Uri uri) {
        try {
            String name = "file_" + System.currentTimeMillis();
            String type = ctx.getContentResolver().getType(uri);
            if (type == null) type = "application/octet-stream";
            File cache = new File(ctx.getCacheDir(), name);
            try (InputStream in = ctx.getContentResolver().openInputStream(uri);
                 FileOutputStream out = new FileOutputStream(cache)) {
                if (in == null) return null;
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }
            RequestBody body = RequestBody.create(MediaType.parse(type), cache);
            return MultipartBody.Part.createFormData("files", cache.getName(), body);
        } catch (Exception e) {
            return null;
        }
    }

    @Override
    public void onDestroyView() {
        super.onDestroyView();
        binding = null;
    }
}


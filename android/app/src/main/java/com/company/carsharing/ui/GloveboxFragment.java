package com.company.carsharing.ui;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;

import com.company.carsharing.CarSharingApplication;
import com.company.carsharing.R;
import com.company.carsharing.databinding.FragmentGloveboxBinding;
import com.company.carsharing.models.GloveboxActiveResponse;
import com.company.carsharing.network.ApiService;
import com.company.carsharing.network.RetrofitClient;
import com.company.carsharing.util.DateParseUtil;
import com.company.carsharing.util.FileOpenUtil;

import java.io.File;
import java.util.Locale;

import okhttp3.ResponseBody;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class GloveboxFragment extends Fragment {

    private FragmentGloveboxBinding binding;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        binding = FragmentGloveboxBinding.inflate(inflater, container, false);
        return binding.getRoot();
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);
        if (getActivity() instanceof MainActivity) {
            ((MainActivity) getActivity()).setToolbarTitle(getString(R.string.glovebox_title));
        }

        binding.gloveboxRefresh.setOnRefreshListener(this::load);
        binding.gloveboxOpenRca.setOnClickListener(v -> openRca());
        binding.gloveboxOpenBroker.setOnClickListener(v -> openBroker());

        load();
    }

    private ApiService api() {
        return RetrofitClient.getApiService(((MainActivity) requireActivity()).getAuthRepository().getSessionPreferences());
    }

    private void setLoading(boolean loading) {
        binding.gloveboxRefresh.setRefreshing(false);
        binding.gloveboxLoading.setVisibility(loading ? View.VISIBLE : View.GONE);
    }

    private void showEmpty(boolean empty) {
        binding.gloveboxEmpty.setVisibility(empty ? View.VISIBLE : View.GONE);
        binding.gloveboxCard.setVisibility(empty ? View.GONE : View.VISIBLE);
    }

    private GloveboxActiveResponse last;

    private void load() {
        setLoading(true);
        showEmpty(false);
        api().getGloveboxActive().enqueue(new Callback<GloveboxActiveResponse>() {
            @Override
            public void onResponse(@NonNull Call<GloveboxActiveResponse> call, @NonNull Response<GloveboxActiveResponse> response) {
                if (!isAdded()) return;
                setLoading(false);
                if (!response.isSuccessful() || response.body() == null) {
                    Toast.makeText(requireContext(), getString(R.string.statistics_load_failed), Toast.LENGTH_SHORT).show();
                    showEmpty(true);
                    return;
                }
                last = response.body();
                if (last == null || !last.isActive() || last.getCar() == null) {
                    showEmpty(true);
                    return;
                }
                showEmpty(false);
                render(last);
            }

            @Override
            public void onFailure(@NonNull Call<GloveboxActiveResponse> call, @NonNull Throwable t) {
                if (!isAdded()) return;
                setLoading(false);
                showEmpty(true);
                Toast.makeText(requireContext(), getString(R.string.statistics_load_failed), Toast.LENGTH_SHORT).show();
            }
        });
    }

    private static String formatExpiry(String raw, Locale loc) {
        if (raw == null || raw.trim().isEmpty()) return "—";
        return DateParseUtil.formatIsoForDisplay(raw.trim(), loc);
    }

    private void render(GloveboxActiveResponse data) {
        GloveboxActiveResponse.GloveboxCar c = data.getCar();
        String label = c.getLabel() != null ? c.getLabel() : "—";
        String cat = c.getVehicleCategory() != null && !c.getVehicleCategory().trim().isEmpty()
                ? c.getVehicleCategory().trim()
                : null;
        binding.gloveboxVehicleValue.setText(cat != null ? (label + " · " + cat) : label);

        Locale loc = getResources().getConfiguration().getLocales().get(0);
        String itp = getString(R.string.glovebox_itp_expires) + ": " + formatExpiry(c.getItpExpiresAt(), loc);
        String rca = getString(R.string.glovebox_rca_expires) + ": " + formatExpiry(c.getRcaExpiresAt(), loc);
        String vignette = getString(R.string.glovebox_vignette_expires) + ": " + formatExpiry(c.getVignetteExpiresAt(), loc);
        binding.gloveboxItp.setText(itp);
        binding.gloveboxRca.setText(rca);
        binding.gloveboxVignette.setText(vignette);

        boolean hasRca = c.getRcaDocumentUrl() != null && !c.getRcaDocumentUrl().trim().isEmpty();
        binding.gloveboxOpenRca.setEnabled(hasRca);
        binding.gloveboxOpenRca.setAlpha(hasRca ? 1f : 0.6f);

        boolean hasBroker = data.getBrokerRenewalUrl() != null && !data.getBrokerRenewalUrl().trim().isEmpty();
        binding.gloveboxOpenBroker.setEnabled(hasBroker);
        binding.gloveboxOpenBroker.setAlpha(hasBroker ? 1f : 0.6f);
    }

    private void openRca() {
        if (last == null || last.getCar() == null) {
            Toast.makeText(requireContext(), getString(R.string.glovebox_missing_doc), Toast.LENGTH_SHORT).show();
            return;
        }
        String rel = last.getCar().getRcaDocumentUrl();
        if (rel == null || rel.trim().isEmpty()) {
            Toast.makeText(requireContext(), getString(R.string.glovebox_missing_doc), Toast.LENGTH_SHORT).show();
            return;
        }
        String base = CarSharingApplication.getApiBaseUrl();
        String abs = rel.startsWith("/") ? base.replaceAll("/+$", "") + rel : base + rel;

        binding.gloveboxOpenRca.setEnabled(false);
        api().downloadFile(abs).enqueue(new Callback<ResponseBody>() {
            @Override
            public void onResponse(@NonNull Call<ResponseBody> call, @NonNull Response<ResponseBody> response) {
                if (!isAdded()) return;
                binding.gloveboxOpenRca.setEnabled(true);

                if (!response.isSuccessful() || response.body() == null) {
                    Toast.makeText(requireContext(), getString(R.string.reports_download_failed), Toast.LENGTH_SHORT).show();
                    return;
                }

                String mime = null;
                try {
                    mime = response.headers().get("Content-Type");
                } catch (Exception ignored) {
                }
                if (mime == null || mime.trim().isEmpty()) {
                    mime = last.getCar().getRcaDocumentContentType();
                }

                String ext = (mime != null && mime.toLowerCase().contains("pdf")) ? ".pdf" : "";
                String carId = last.getCar().getId() != null ? last.getCar().getId() : "car";
                String filename = "rca-" + carId + ext;

                try {
                    File f = FileOpenUtil.writeResponseBodyToCache(requireContext(), response.body(), filename);
                    FileOpenUtil.openFile(requireContext(), f, mime, "Open document");
                } catch (Exception e) {
                    Toast.makeText(requireContext(), getString(R.string.reports_download_failed), Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onFailure(@NonNull Call<ResponseBody> call, @NonNull Throwable t) {
                if (!isAdded()) return;
                binding.gloveboxOpenRca.setEnabled(true);
                Toast.makeText(requireContext(), getString(R.string.reports_download_failed), Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void openBroker() {
        String url = last != null ? last.getBrokerRenewalUrl() : null;
        if (url == null || url.trim().isEmpty()) {
            Toast.makeText(requireContext(), getString(R.string.glovebox_missing_doc), Toast.LENGTH_SHORT).show();
            return;
        }
        openUrl(url.trim());
    }

    private void openUrl(String url) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            startActivity(intent);
        } catch (Exception e) {
            Toast.makeText(requireContext(), "Could not open link.", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    public void onDestroyView() {
        super.onDestroyView();
        binding = null;
    }
}


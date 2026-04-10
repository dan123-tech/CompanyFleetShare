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

    private static String labelLine(int labelRes, String value) {
        String v = value == null || value.trim().isEmpty() ? "—" : value;
        return v;
    }

    private void render(GloveboxActiveResponse data) {
        GloveboxActiveResponse.GloveboxCar c = data.getCar();
        binding.gloveboxVehicleValue.setText(c.getLabel() != null ? c.getLabel() : "—");

        String itp = getString(R.string.glovebox_itp_expires) + ": " + (c.getItpExpiresAt() != null ? c.getItpExpiresAt() : "—");
        String rca = getString(R.string.glovebox_rca_expires) + ": " + (c.getRcaExpiresAt() != null ? c.getRcaExpiresAt() : "—");
        String vignette = getString(R.string.glovebox_vignette_expires) + ": " + (c.getVignetteExpiresAt() != null ? c.getVignetteExpiresAt() : "—");
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
        openUrl(abs);
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


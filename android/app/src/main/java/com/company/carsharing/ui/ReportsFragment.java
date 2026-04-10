package com.company.carsharing.ui;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;

import com.company.carsharing.R;
import com.company.carsharing.data.repository.AuthRepository;
import com.company.carsharing.databinding.FragmentReportsBinding;
import com.company.carsharing.models.Reservation;
import com.company.carsharing.network.RetrofitClient;
import com.company.carsharing.util.JourneySheetUtil;

import java.util.ArrayList;
import java.util.List;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class ReportsFragment extends Fragment implements HistoryAdapter.OnHistoryActionListener {
    private FragmentReportsBinding binding;
    private HistoryAdapter adapter;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        binding = FragmentReportsBinding.inflate(inflater, container, false);
        if (getActivity() instanceof MainActivity) {
            ((MainActivity) getActivity()).setToolbarTitle(getString(R.string.reports_title));
        }
        adapter = new HistoryAdapter(requireContext(), this);
        binding.reportsHistoryList.setAdapter(adapter);
        binding.reportsOpenStatistics.setOnClickListener(v -> {
            if (getActivity() instanceof MainActivity) {
                ((MainActivity) getActivity()).showFragment(new StatisticsFragment(), R.id.nav_statistics);
            }
        });
        load();
        return binding.getRoot();
    }

    private void load() {
        RetrofitClient.getApiService(new AuthRepository(requireContext()).getSessionPreferences())
                .getReservationHistory()
                .enqueue(new Callback<List<Reservation>>() {
                    @Override
                    public void onResponse(@NonNull Call<List<Reservation>> call, @NonNull Response<List<Reservation>> response) {
                        if (!isAdded()) return;
                        if (response.isSuccessful() && response.body() != null) {
                            List<Reservation> completed = new ArrayList<>();
                            for (Reservation r : response.body()) {
                                if (r != null && "COMPLETED".equalsIgnoreCase(r.getStatus())) completed.add(r);
                            }
                            adapter.setReservations(completed);
                            binding.reportsEmpty.setVisibility(completed.isEmpty() ? View.VISIBLE : View.GONE);
                        } else {
                            Toast.makeText(requireContext(), getString(R.string.statistics_load_failed), Toast.LENGTH_SHORT).show();
                        }
                    }

                    @Override
                    public void onFailure(@NonNull Call<List<Reservation>> call, @NonNull Throwable t) {
                        if (!isAdded()) return;
                        Toast.makeText(requireContext(), getString(R.string.statistics_load_failed), Toast.LENGTH_SHORT).show();
                    }
                });
    }

    @Override
    public void onDownloadJourneySheet(Reservation r) {
        if (r == null) return;
        JourneySheetUtil.downloadAndOpen(
                requireContext(),
                RetrofitClient.getApiService(new AuthRepository(requireContext()).getSessionPreferences()),
                r.getId(),
                r.getStatus()
        );
    }

    @Override
    public void onDestroyView() {
        super.onDestroyView();
        binding = null;
    }
}


package com.company.carsharing.ui;

import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.fragment.app.Fragment;

import com.company.carsharing.R;
import com.company.carsharing.data.SessionHolder;
import com.company.carsharing.data.repository.AuthRepository;
import com.company.carsharing.databinding.FragmentStatisticsBinding;
import com.company.carsharing.models.Car;
import com.company.carsharing.models.Company;
import com.company.carsharing.models.Member;
import com.company.carsharing.models.Reservation;
import com.company.carsharing.network.RetrofitClient;
import com.company.carsharing.util.FuelCostCalculator;
import com.company.carsharing.util.I18n;
import com.company.carsharing.util.StatisticsPdfExporter;
import com.company.carsharing.util.StatisticsPeriodHelper;
import com.github.mikephil.charting.components.XAxis;
import com.github.mikephil.charting.data.BarData;
import com.github.mikephil.charting.data.BarDataSet;
import com.github.mikephil.charting.data.BarEntry;
import com.github.mikephil.charting.formatter.IndexAxisValueFormatter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class StatisticsFragment extends Fragment {

    private static final int CO2_BAR_COLOR = Color.parseColor("#1E40AF");
    private static final int CAR_BAR_COLOR = Color.parseColor("#185FA5");

    private FragmentStatisticsBinding binding;
    private List<Reservation> cachedReservations = new ArrayList<>();
    private List<Car> cachedCars = new ArrayList<>();
    private List<Member> cachedMembers = new ArrayList<>();
    private String selectedPeriod = StatisticsPeriodHelper.PERIOD_30D;

    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState) {
        binding = FragmentStatisticsBinding.inflate(inflater, container, false);
        if (getActivity() instanceof MainActivity) {
            ((MainActivity) getActivity()).setToolbarTitle(getString(R.string.statistics_title));
        }

        binding.btnPdf7d.setOnClickListener(v -> exportPdf(StatisticsPeriodHelper.PERIOD_7D));
        binding.btnPdf30d.setOnClickListener(v -> exportPdf(StatisticsPeriodHelper.PERIOD_30D));
        binding.btnPdf6m.setOnClickListener(v -> exportPdf(StatisticsPeriodHelper.PERIOD_6M));
        binding.btnPdf1y.setOnClickListener(v -> exportPdf(StatisticsPeriodHelper.PERIOD_1Y));

        View.OnClickListener periodClick = v -> {
            int id = v.getId();
            if (id == R.id.chip_7d) selectedPeriod = StatisticsPeriodHelper.PERIOD_7D;
            else if (id == R.id.chip_30d) selectedPeriod = StatisticsPeriodHelper.PERIOD_30D;
            else if (id == R.id.chip_6m) selectedPeriod = StatisticsPeriodHelper.PERIOD_6M;
            else if (id == R.id.chip_1y) selectedPeriod = StatisticsPeriodHelper.PERIOD_1Y;
            if (!cachedReservations.isEmpty() || !cachedCars.isEmpty()) {
                applyPeriod();
            }
        };
        binding.chip7d.setOnClickListener(periodClick);
        binding.chip30d.setOnClickListener(periodClick);
        binding.chip6m.setOnClickListener(periodClick);
        binding.chip1y.setOnClickListener(periodClick);

        setupChartsChrome();
        loadData();
        return binding.getRoot();
    }

    private void setupChartsChrome() {
        binding.statChartCo2.getDescription().setEnabled(false);
        binding.statChartCo2.getLegend().setEnabled(false);
        binding.statChartCo2.setDrawGridBackground(false);
        binding.statChartCo2.setScaleEnabled(false);
        binding.statChartCo2.setPinchZoom(false);
        binding.statChartCo2.getAxisRight().setEnabled(false);
        binding.statChartCo2.getXAxis().setPosition(XAxis.XAxisPosition.BOTTOM);
        binding.statChartCo2.getXAxis().setGranularity(1f);
        binding.statChartCo2.getAxisLeft().setAxisMinimum(0f);

        binding.statChartCars.getDescription().setEnabled(false);
        binding.statChartCars.getLegend().setEnabled(false);
        binding.statChartCars.setDrawGridBackground(false);
        binding.statChartCars.setScaleEnabled(false);
        binding.statChartCars.setPinchZoom(false);
        binding.statChartCars.getAxisRight().setEnabled(false);
        binding.statChartCars.getXAxis().setPosition(XAxis.XAxisPosition.BOTTOM);
        binding.statChartCars.getXAxis().setGranularity(1f);
        binding.statChartCars.getAxisLeft().setAxisMinimum(0f);
    }

    private Locale appLocale() {
        if (getResources() == null) return Locale.getDefault();
        return getResources().getConfiguration().getLocales().get(0);
    }

    private void loadData() {
        binding.statLoading.setVisibility(View.VISIBLE);
        String dash = getString(R.string.em_dash);
        binding.statActive.setText(dash);
        binding.statKm.setText(dash);
        binding.statFuel.setText(dash);
        binding.statCo2.setText(dash);
        binding.statLeaderboard.removeAllViews();
        binding.statTopUsers.removeAllViews();

        RetrofitClient.getApiService(new AuthRepository(requireContext()).getSessionPreferences())
                .getReservations(null, null).enqueue(new Callback<List<Reservation>>() {
                    @Override
                    public void onResponse(@NonNull Call<List<Reservation>> call, @NonNull Response<List<Reservation>> response) {
                        if (getActivity() == null) return;
                        List<Reservation> reservations = response.isSuccessful() && response.body() != null
                                ? response.body() : new ArrayList<>();
                        RetrofitClient.getApiService(new AuthRepository(requireContext()).getSessionPreferences())
                                .getCars(null).enqueue(new Callback<List<Car>>() {
                                    @Override
                                    public void onResponse(@NonNull Call<List<Car>> call, @NonNull Response<List<Car>> response) {
                                        if (getActivity() == null) return;
                                        List<Car> cars = response.isSuccessful() && response.body() != null
                                                ? response.body() : new ArrayList<>();
                                        RetrofitClient.getApiService(new AuthRepository(requireContext()).getSessionPreferences())
                                                .getUsers(null).enqueue(new Callback<List<Member>>() {
                                                    @Override
                                                    public void onResponse(@NonNull Call<List<Member>> call, @NonNull Response<List<Member>> response) {
                                                        if (getActivity() == null) return;
                                                        cachedMembers = response.isSuccessful() && response.body() != null
                                                                ? response.body() : new ArrayList<>();
                                                        cachedReservations = reservations;
                                                        cachedCars = cars;
                                                        binding.statLoading.setVisibility(View.GONE);
                                                        applyPeriod();
                                                    }

                                                    @Override
                                                    public void onFailure(@NonNull Call<List<Member>> call, @NonNull Throwable t) {
                                                        if (getActivity() == null) return;
                                                        cachedMembers = new ArrayList<>();
                                                        cachedReservations = reservations;
                                                        cachedCars = cars;
                                                        binding.statLoading.setVisibility(View.GONE);
                                                        applyPeriod();
                                                    }
                                                });
                                    }

                                    @Override
                                    public void onFailure(@NonNull Call<List<Car>> call, @NonNull Throwable t) {
                                        if (getActivity() == null) return;
                                        binding.statLoading.setText(getString(R.string.statistics_load_failed));
                                        binding.statLoading.setVisibility(View.VISIBLE);
                                    }
                                });
                    }

                    @Override
                    public void onFailure(@NonNull Call<List<Reservation>> call, @NonNull Throwable t) {
                        if (getActivity() == null) return;
                        binding.statLoading.setText(getString(R.string.statistics_load_failed));
                        binding.statLoading.setVisibility(View.VISIBLE);
                    }
                });
    }

    private StatisticsPeriodHelper.PeriodStats computeStats(String period) {
        Company company = SessionHolder.getCompany();
        double defaultL100 = company != null ? company.getDefaultConsumptionL100km() : 7.5;
        double defaultKwh100 = 20.0;
        return StatisticsPeriodHelper.compute(
                period,
                cachedReservations,
                cachedCars,
                cachedMembers,
                company,
                defaultL100,
                defaultKwh100,
                appLocale());
    }

    private void applyPeriod() {
        StatisticsPeriodHelper.PeriodStats stats = computeStats(selectedPeriod);
        Company company = SessionHolder.getCompany();
        boolean hasPrices = FuelCostCalculator.hasAnyUnitPrice(company);
        Locale loc = appLocale();

        binding.statActive.setText(String.valueOf(stats.activeCount));
        binding.statKm.setText(String.format(loc, "%,d km", stats.totalKmPeriod));
        binding.statFuel.setText(hasPrices ? String.format(loc, "%.2f", stats.fuelCostPeriod) : getString(R.string.pdf_not_available));
        binding.statCo2.setText(String.format(loc, "%.1f kg", stats.co2KgPeriod));

        int textColor = ContextCompat.getColor(requireContext(), R.color.on_surface);

        binding.statLeaderboard.removeAllViews();
        for (int i = 0; i < stats.costLeaderboard.size(); i++) {
            StatisticsPeriodHelper.CostLeaderRow row = stats.costLeaderboard.get(i);
            TextView tv = new TextView(requireContext());
            String model = row.car.getModel() != null ? row.car.getModel() : "";
            String makeModel = (row.car.getBrand() + " " + model).trim();
            String plate = row.car.getRegistrationNumber() != null ? row.car.getRegistrationNumber() : "";
            tv.setText(String.format(loc, "%d. %s | %s | %.2f", i + 1, makeModel, plate, row.cost));
            tv.setTextSize(14f);
            tv.setTextColor(textColor);
            tv.setPadding(0, 12, 0, 12);
            binding.statLeaderboard.addView(tv);
        }

        binding.statTopUsers.removeAllViews();
        for (int i = 0; i < stats.topUsers.size(); i++) {
            StatisticsPeriodHelper.UserCountRow u = stats.topUsers.get(i);
            TextView tv = new TextView(requireContext());
            tv.setText(String.format(loc, "%d. %s — %d", i + 1, u.name, u.count));
            tv.setTextSize(14f);
            tv.setTextColor(textColor);
            tv.setPadding(0, 12, 0, 12);
            binding.statTopUsers.addView(tv);
        }

        bindCo2Chart(stats);
        bindCarUsageChart(stats);

        if (stats.costLeaderboard.isEmpty() && stats.topUsers.isEmpty() && stats.totalKmPeriod == 0) {
            // keep charts empty but visible
        }
    }

    private void bindCo2Chart(StatisticsPeriodHelper.PeriodStats stats) {
        List<BarEntry> entries = new ArrayList<>();
        List<String> labels = new ArrayList<>();
        for (int i = 0; i < stats.co2Trend.size(); i++) {
            StatisticsPeriodHelper.TrendBucket b = stats.co2Trend.get(i);
            entries.add(new BarEntry(i, (float) b.co2Kg));
            labels.add(b.label);
        }
        if (entries.isEmpty()) {
            binding.statChartCo2.setData(null);
            binding.statChartCo2.invalidate();
            return;
        }
        BarDataSet ds = new BarDataSet(entries, getString(R.string.chart_label_co2));
        ds.setColor(CO2_BAR_COLOR);
        ds.setDrawValues(false);
        BarData data = new BarData(ds);
        data.setBarWidth(0.55f);
        binding.statChartCo2.setData(data);
        binding.statChartCo2.getXAxis().setValueFormatter(new IndexAxisValueFormatter(labels));
        binding.statChartCo2.getXAxis().setLabelCount(Math.min(8, labels.size()), false);
        binding.statChartCo2.getXAxis().setLabelRotationAngle(labels.size() > 10 ? -45f : 0f);
        binding.statChartCo2.invalidate();

        Locale loc = appLocale();
        binding.statChartCo2.setOnChartValueSelectedListener(new com.github.mikephil.charting.listener.OnChartValueSelectedListener() {
            @Override
            public void onValueSelected(com.github.mikephil.charting.data.Entry e, com.github.mikephil.charting.highlight.Highlight h) {
                int idx = (int) e.getX();
                if (idx >= 0 && idx < stats.co2Trend.size()) {
                    StatisticsPeriodHelper.TrendBucket b = stats.co2Trend.get(idx);
                    Toast.makeText(requireContext(),
                            getString(R.string.statistics_co2_tooltip, b.label, b.co2Kg),
                            Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onNothingSelected() {
            }
        });
    }

    private void bindCarUsageChart(StatisticsPeriodHelper.PeriodStats stats) {
        final List<BarEntry> entries = new ArrayList<>();
        final List<String> labels = new ArrayList<>();
        for (int i = 0; i < stats.carUsage.size(); i++) {
            StatisticsPeriodHelper.CarUsageRow row = stats.carUsage.get(i);
            entries.add(new BarEntry(i, (float) row.km));
            String pl = row.plate != null ? row.plate : "—";
            labels.add(pl.length() > 8 ? pl.substring(0, 8) + "…" : pl);
        }
        if (entries.isEmpty()) {
            binding.statChartCars.setData(null);
            binding.statChartCars.invalidate();
            return;
        }

        binding.statChartCars.post(() -> {
            View card = (View) binding.statChartCars.getParent();
            View hsv = (View) card.getParent();
            int parentW = hsv != null ? hsv.getWidth() : 0;
            if (parentW <= 0) parentW = getResources().getDisplayMetrics().widthPixels - (int) (32 * getResources().getDisplayMetrics().density);
            float density = getResources().getDisplayMetrics().density;
            int minW = (int) (stats.carUsage.size() * 44 * density);
            int w = Math.max(parentW, minW);
            ViewGroup.LayoutParams lp = binding.statChartCars.getLayoutParams();
            lp.width = w;
            binding.statChartCars.setLayoutParams(lp);

            BarDataSet ds = new BarDataSet(entries, getString(R.string.chart_label_km));
            ds.setColor(CAR_BAR_COLOR);
            ds.setDrawValues(false);
            BarData data = new BarData(ds);
            data.setBarWidth(0.45f);
            binding.statChartCars.setData(data);
            binding.statChartCars.getXAxis().setValueFormatter(new IndexAxisValueFormatter(labels));
            binding.statChartCars.getXAxis().setLabelRotationAngle(-35f);
            binding.statChartCars.invalidate();
        });

        binding.statChartCars.setOnChartValueSelectedListener(new com.github.mikephil.charting.listener.OnChartValueSelectedListener() {
            @Override
            public void onValueSelected(com.github.mikephil.charting.data.Entry e, com.github.mikephil.charting.highlight.Highlight h) {
                int idx = (int) e.getX();
                if (idx >= 0 && idx < stats.carUsage.size()) {
                    StatisticsPeriodHelper.CarUsageRow row = stats.carUsage.get(idx);
                    String ft = I18n.fuelType(requireContext(), row.car != null ? row.car.getFuelType() : null);
                    Toast.makeText(requireContext(),
                            getString(R.string.statistics_car_tooltip, row.brandModel, row.plate, ft, (int) row.km, row.reservationsStartedInWindow),
                            Toast.LENGTH_LONG).show();
                }
            }

            @Override
            public void onNothingSelected() {
            }
        });
    }

    private void exportPdf(String period) {
        if (cachedCars.isEmpty() && cachedReservations.isEmpty()) {
            Toast.makeText(requireContext(), R.string.statistics_load_failed, Toast.LENGTH_SHORT).show();
            return;
        }
        Company company = SessionHolder.getCompany();
        boolean hasPrices = FuelCostCalculator.hasAnyUnitPrice(company);
        Locale loc = appLocale();
        StatisticsPeriodHelper.PeriodStats s = computeStats(period);
        String label = getString(I18n.periodLabelResId(period));
        try {
            java.io.File file = StatisticsPdfExporter.export(requireContext(), s, label, hasPrices, loc);
            Uri uri = FileProvider.getUriForFile(requireContext(),
                    requireContext().getPackageName() + ".fileprovider", file);
            Intent share = new Intent(Intent.ACTION_SEND);
            share.setType("application/pdf");
            share.putExtra(Intent.EXTRA_STREAM, uri);
            share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(share, getString(R.string.statistics_share_chooser)));
        } catch (IOException ex) {
            Toast.makeText(requireContext(), R.string.statistics_pdf_error, Toast.LENGTH_SHORT).show();
        }
    }
}

package com.company.carsharing.ui;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.ListView;
import android.widget.Spinner;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import com.company.carsharing.R;
import com.company.carsharing.data.SessionHolder;
import com.company.carsharing.data.repository.AuthRepository;
import com.company.carsharing.models.Car;
import com.company.carsharing.models.Reservation;
import com.company.carsharing.models.User;
import com.company.carsharing.network.RetrofitClient;
import com.company.carsharing.reminders.ReservationAlarmScheduler;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

/**
 * Booking calendar (user: own reservations) or fleet calendar (admin: all reservations),
 * with an “All cars” / per-vehicle filter — mirrors the web dashboards.
 */
public class BookingCalendarFragment extends Fragment {

    private static final String ARG_FLEET = "fleet";

    private boolean fleetMode;
    private SwipeRefreshLayout refreshLayout;
    private ListView listView;
    private TextView emptyView;
    private TextView subtitleView;
    private Spinner carSpinner;

    private final List<String> spinnerLabels = new ArrayList<>();
    private final List<String> spinnerCarIds = new ArrayList<>();

    private List<Car> loadedCars = new ArrayList<>();
    private List<Reservation> loadedReservations = new ArrayList<>();
    private String selectedCarId = "";

    private BookingCalendarAdapter adapter;

    public static BookingCalendarFragment newInstance(boolean fleetMode) {
        BookingCalendarFragment f = new BookingCalendarFragment();
        Bundle b = new Bundle();
        b.putBoolean(ARG_FLEET, fleetMode);
        f.setArguments(b);
        return f;
    }

    @Override
    public void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Bundle b = getArguments();
        fleetMode = b != null && b.getBoolean(ARG_FLEET, false);
    }

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        View root = inflater.inflate(R.layout.fragment_booking_calendar, container, false);
        if (getActivity() instanceof MainActivity) {
            ((MainActivity) getActivity()).setToolbarTitle(fleetMode
                    ? getString(R.string.nav_fleet_calendar) : getString(R.string.nav_booking_calendar));
        }

        subtitleView = root.findViewById(R.id.calendar_subtitle);
        subtitleView.setText(fleetMode ? getString(R.string.calendar_subtitle_fleet) : getString(R.string.calendar_subtitle_personal));

        refreshLayout = root.findViewById(R.id.calendar_refresh);
        listView = root.findViewById(R.id.calendar_list);
        emptyView = root.findViewById(R.id.calendar_empty);
        carSpinner = root.findViewById(R.id.calendar_car_spinner);

        adapter = new BookingCalendarAdapter(requireContext());
        adapter.setShowBooker(fleetMode);
        listView.setAdapter(adapter);

        refreshLayout.setOnRefreshListener(this::loadData);

        carSpinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                if (position >= 0 && position < spinnerCarIds.size()) {
                    selectedCarId = spinnerCarIds.get(position) != null ? spinnerCarIds.get(position) : "";
                } else {
                    selectedCarId = "";
                }
                applyFilterAndSort();
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {
            }
        });

        loadData();
        return root;
    }

    private void loadData() {
        refreshLayout.setRefreshing(true);
        AuthRepository authRepo = new AuthRepository(requireContext());
        AtomicInteger pending = new AtomicInteger(2);

        Runnable finish = () -> {
            if (pending.decrementAndGet() != 0) return;
            if (getActivity() == null) return;
            requireActivity().runOnUiThread(() -> {
                refreshLayout.setRefreshing(false);
                rebuildCarSpinner();
                applyFilterAndSort();
            });
        };

        RetrofitClient.getApiService(authRepo.getSessionPreferences())
                .getAllCars()
                .enqueue(new Callback<List<Car>>() {
                    @Override
                    public void onResponse(@NonNull Call<List<Car>> call, @NonNull Response<List<Car>> response) {
                        loadedCars = response.isSuccessful() && response.body() != null
                                ? new ArrayList<>(response.body())
                                : new ArrayList<>();
                        finish.run();
                    }

                    @Override
                    public void onFailure(@NonNull Call<List<Car>> call, @NonNull Throwable t) {
                        loadedCars = new ArrayList<>();
                        finish.run();
                    }
                });

        RetrofitClient.getApiService(authRepo.getSessionPreferences())
                .getReservations(null, null)
                .enqueue(new Callback<List<Reservation>>() {
                    @Override
                    public void onResponse(@NonNull Call<List<Reservation>> call, @NonNull Response<List<Reservation>> response) {
                        loadedReservations = response.isSuccessful() && response.body() != null
                                ? new ArrayList<>(response.body())
                                : new ArrayList<>();
                        finish.run();
                    }

                    @Override
                    public void onFailure(@NonNull Call<List<Reservation>> call, @NonNull Throwable t) {
                        loadedReservations = new ArrayList<>();
                        finish.run();
                    }
                });
    }

    private void rebuildCarSpinner() {
        List<CarLabel> options = new ArrayList<>();
        if (loadedCars != null) {
            for (Car c : loadedCars) {
                if (c == null || c.getId() == null) continue;
                String label = buildCarLabel(c);
                options.add(new CarLabel(c.getId(), label));
            }
        }
        Collections.sort(options, Comparator.comparing(a -> a.label, String.CASE_INSENSITIVE_ORDER));

        spinnerLabels.clear();
        spinnerCarIds.clear();
        spinnerLabels.add(getString(R.string.calendar_all_cars));
        spinnerCarIds.add("");

        for (CarLabel o : options) {
            spinnerLabels.add(o.label);
            spinnerCarIds.add(o.id);
        }

        ArrayAdapter<String> spAdapter = new ArrayAdapter<>(
                requireContext(),
                android.R.layout.simple_spinner_dropdown_item,
                spinnerLabels);
        spAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        carSpinner.setAdapter(spAdapter);

        int restore = 0;
        if (selectedCarId != null && !selectedCarId.isEmpty()) {
            int idx = spinnerCarIds.indexOf(selectedCarId);
            if (idx >= 0) restore = idx;
            else selectedCarId = "";
        }
        carSpinner.setSelection(restore, false);
        if (restore < spinnerCarIds.size()) {
            selectedCarId = spinnerCarIds.get(restore) != null ? spinnerCarIds.get(restore) : "";
        }
    }

    private static String buildCarLabel(Car c) {
        String b = c.getBrand() != null ? c.getBrand() : "";
        String reg = c.getRegistrationNumber() != null ? c.getRegistrationNumber() : "";
        String m = c.getModel() != null ? c.getModel() : "";
        String left = (b + " " + m).trim();
        if (!reg.isEmpty()) {
            return left.isEmpty() ? reg : left + " (" + reg + ")";
        }
        return left.isEmpty() ? c.getId() : left;
    }

    private void applyFilterAndSort() {
        List<Reservation> out = new ArrayList<>();
        User self = SessionHolder.getUser();
        String myId = self != null ? self.getId() : null;

        for (Reservation r : loadedReservations) {
            if (r == null) continue;
            if ("CANCELLED".equalsIgnoreCase(r.getStatus())) continue;
            if (!fleetMode) {
                if (myId == null || r.getUserId() == null || !myId.equals(r.getUserId())) continue;
            }
            if (selectedCarId != null && !selectedCarId.isEmpty()) {
                String cid = r.getCarId();
                if (cid == null && r.getCar() != null) cid = r.getCar().getId();
                if (cid == null || !selectedCarId.equals(cid)) continue;
            }
            out.add(r);
        }

        Collections.sort(out, (a, b) -> Long.compare(startMs(a), startMs(b)));

        adapter.setItems(out);
        boolean empty = out.isEmpty();
        emptyView.setVisibility(empty ? View.VISIBLE : View.GONE);
        listView.setVisibility(empty ? View.GONE : View.VISIBLE);

        if (!fleetMode && myId != null) {
            ReservationAlarmScheduler.schedule(requireContext(), loadedReservations, myId);
        }
    }

    private static long startMs(Reservation r) {
        if (r == null || r.getStartDate() == null) return 0L;
        long t = ReservationAlarmScheduler.parseIsoToMillis(r.getStartDate());
        return t > 0 ? t : 0L;
    }

    private static final class CarLabel {
        final String id;
        final String label;

        CarLabel(String id, String label) {
            this.id = id;
            this.label = label;
        }
    }
}

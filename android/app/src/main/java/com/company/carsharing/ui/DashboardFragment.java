package com.company.carsharing.ui;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;

import com.company.carsharing.ui.MainActivity;
import com.company.carsharing.R;
import com.company.carsharing.data.SessionHolder;
import com.company.carsharing.models.Car;
import com.company.carsharing.models.Company;
import com.company.carsharing.models.Member;
import com.company.carsharing.models.Reservation;
import com.company.carsharing.models.User;
import com.company.carsharing.network.ApiService;
import com.company.carsharing.network.RetrofitClient;

import java.util.List;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

/**
 * Global Dashboard with Material CardViews: Total Cars, Active Reservations, Team Members, Available Cars.
 */
public class DashboardFragment extends Fragment {

    private TextView totalCarsView;
    private TextView activeReservationsView;
    private TextView totalUsersView;
    private TextView availableCarsView;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        View root = inflater.inflate(R.layout.fragment_dashboard, container, false);
        totalCarsView = root.findViewById(R.id.dashboard_total_cars);
        activeReservationsView = root.findViewById(R.id.dashboard_active_reservations);
        totalUsersView = root.findViewById(R.id.dashboard_total_users);
        availableCarsView = root.findViewById(R.id.dashboard_available_cars);
        return root;
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);
        if (getActivity() instanceof MainActivity) {
            ((MainActivity) getActivity()).setToolbarTitle(getString(R.string.nav_dashboard));
        }
        loadStats();
    }

    private void loadStats() {
        User user = SessionHolder.getUser();
        if (user == null) return;
        ApiService api = RetrofitClient.getApiService(
                ((MainActivity) requireActivity()).getAuthRepository().getSessionPreferences());

        Company company = SessionHolder.getCompany();
        if (company != null && company.getCount() != null) {
            totalCarsView.setText(String.valueOf(company.getCount().cars != null ? company.getCount().cars : 0));
            totalUsersView.setText(String.valueOf(company.getCount().members != null ? company.getCount().members : 0));
        }

        api.getAllCars().enqueue(new Callback<List<Car>>() {
            @Override
            public void onResponse(@NonNull Call<List<Car>> call, @NonNull Response<List<Car>> response) {
                if (response.isSuccessful() && response.body() != null) {
                    List<Car> cars = response.body();
                    int total = cars.size();
                    int available = 0;
                    for (Car c : cars) {
                        if (c != null && "AVAILABLE".equalsIgnoreCase(c.getStatus())) available++;
                    }
                    totalCarsView.setText(String.valueOf(total));
                    availableCarsView.setText(String.valueOf(available));
                }
            }
            @Override
            public void onFailure(@NonNull Call<List<Car>> call, @NonNull Throwable t) {
                totalCarsView.setText(getString(R.string.em_dash));
                availableCarsView.setText(getString(R.string.em_dash));
            }
        });

        api.getReservations(null, null).enqueue(new Callback<List<Reservation>>() {
            @Override
            public void onResponse(@NonNull Call<List<Reservation>> call, @NonNull Response<List<Reservation>> response) {
                if (response.isSuccessful() && response.body() != null) {
                    int active = 0;
                    for (Reservation r : response.body()) {
                        if (r != null && "ACTIVE".equalsIgnoreCase(r.getStatus())) active++;
                    }
                    activeReservationsView.setText(String.valueOf(active));
                }
            }
            @Override
            public void onFailure(@NonNull Call<List<Reservation>> call, @NonNull Throwable t) {
                activeReservationsView.setText(getString(R.string.em_dash));
            }
        });

        api.getUsers(null).enqueue(new Callback<List<Member>>() {
            @Override
            public void onResponse(@NonNull Call<List<Member>> call, @NonNull Response<List<Member>> response) {
                if (response.isSuccessful() && response.body() != null) {
                    totalUsersView.setText(String.valueOf(response.body().size()));
                }
            }
            @Override
            public void onFailure(@NonNull Call<List<Member>> call, @NonNull Throwable t) {
                if (totalUsersView.getText().toString().equals(getString(R.string.em_dash))) totalUsersView.setText("0");
            }
        });
    }
}

package com.company.carsharing.ui;

import android.content.Intent;
import android.os.Bundle;
import android.view.MenuItem;
import android.view.View;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.ActionBarDrawerToggle;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.GravityCompat;
import androidx.drawerlayout.widget.DrawerLayout;
import androidx.fragment.app.Fragment;
import androidx.fragment.app.FragmentTransaction;

import com.company.carsharing.R;
import com.company.carsharing.data.SessionHolder;
import com.company.carsharing.data.repository.AuthRepository;
import com.company.carsharing.models.Company;
import com.company.carsharing.models.User;
import com.company.carsharing.ui.login.LoginActivity;
import com.google.android.material.navigation.NavigationView;

public class MainActivity extends AppCompatActivity implements NavigationView.OnNavigationItemSelectedListener {

    private DrawerLayout drawerLayout;
    private NavigationView navView;
    private AuthRepository authRepository;
    private boolean drawerEnabled;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        authRepository = new AuthRepository(this);
        if (!authRepository.isLoggedIn()) {
            startActivity(new Intent(this, LoginActivity.class));
            finish();
            return;
        }
        // "rememberMe" controls whether credentials are saved for the NEXT launch,
        // not whether the current authenticated session is valid. Do not force-logout here.
        setContentView(R.layout.activity_main);
        drawerLayout = findViewById(R.id.drawer_layout);
        navView = findViewById(R.id.nav_view);
        navView.setNavigationItemSelectedListener(this);
        View logoutBtn = findViewById(R.id.drawer_logout);
        if (logoutBtn != null) logoutBtn.setOnClickListener(v -> {
            authRepository.logout(this);
            startActivity(new Intent(this, LoginActivity.class));
            finish();
        });
        getSupportFragmentManager().beginTransaction()
                .replace(R.id.fragment_container, new LoadingFragment())
                .commit();
        authRepository.refreshSession(new AuthRepository.SessionCallback() {
            @Override
            public void onLoaded(User user, Company company) {
                SessionHolder.set(user, company);
                runOnUiThread(() -> {
                    if (company == null) {
                        showNoCompany();
                    } else {
                        setupDrawer(user, company);
                        showFragment(new DashboardFragment());
                    }
                });
            }
            @Override
            public void onError(String message) {
                runOnUiThread(() -> {
                    Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
                    startActivity(new Intent(MainActivity.this, LoginActivity.class));
                    finish();
                });
            }
        });
    }

    private boolean isAdmin(User user) {
        return user != null && "ADMIN".equalsIgnoreCase(user.getRole());
    }

    private void showNoCompany() {
        drawerEnabled = false;
        if (findViewById(R.id.toolbar) != null) {
            findViewById(R.id.toolbar).setVisibility(View.GONE);
        }
        showFragment(new NoCompanyFragment());
    }

    public void setupDrawer(User user, Company company) {
        drawerEnabled = true;
        View toolbarView = findViewById(R.id.toolbar);
        if (toolbarView != null) toolbarView.setVisibility(View.VISIBLE);
        View header = navView.getHeaderView(0);
        if (header != null) {
            // Avatar: now a TextView showing the initial letter of the user's name
            android.widget.TextView avatar = header.findViewById(R.id.nav_header_avatar);
            if (avatar != null && user != null) {
                String initial = (user.getName() != null && !user.getName().isEmpty())
                        ? user.getName().substring(0, 1).toUpperCase()
                        : (user.getEmail() != null && !user.getEmail().isEmpty()
                                ? user.getEmail().substring(0, 1).toUpperCase() : "?");
                avatar.setText(initial);
            }
            android.widget.TextView title = header.findViewById(R.id.nav_header_title);
            android.widget.TextView sub = header.findViewById(R.id.nav_header_subtitle);
            if (title != null) title.setText(user != null && user.getName() != null && !user.getName().isEmpty()
                    ? user.getName() : (user != null ? user.getEmail() : ""));
            String roleLabel = user != null && "ADMIN".equalsIgnoreCase(user.getRole())
                    ? getString(R.string.role_display_admin) : getString(R.string.role_display_member);
            String companyName = company != null ? company.getName() : "";
            if (sub != null) sub.setText(roleLabel + (companyName.isEmpty() ? "" : " · " + companyName));
        }
        if (!isAdmin(user)) {
            navView.getMenu().setGroupVisible(R.id.group_admin, false);
        }
        androidx.appcompat.widget.Toolbar toolbar = findViewById(R.id.toolbar);
        if (toolbar != null) {
            toolbar.setNavigationOnClickListener(v -> drawerLayout.openDrawer(GravityCompat.START));
        }
    }

    public void showFragment(Fragment fragment) {
        getSupportFragmentManager().beginTransaction()
                .replace(R.id.fragment_container, fragment)
                .setTransition(FragmentTransaction.TRANSIT_FRAGMENT_FADE)
                .commit();
        if (drawerEnabled) drawerLayout.closeDrawer(GravityCompat.START);
    }

    public AuthRepository getAuthRepository() {
        return authRepository;
    }

    public void setToolbarTitle(String title) {
        androidx.appcompat.widget.Toolbar toolbar = findViewById(R.id.toolbar);
        if (toolbar != null) toolbar.setTitle(title != null ? title : getString(R.string.app_name));
    }

    @Override
    public boolean onNavigationItemSelected(@NonNull MenuItem item) {
        int id = item.getItemId();
        if (id == R.id.nav_dashboard) showFragment(new DashboardFragment());
        else if (id == R.id.nav_company) showFragment(new CompanyFragment());
        else if (id == R.id.nav_statistics) showFragment(new StatisticsFragment());
        else if (id == R.id.nav_cars) showFragment(new CarsFragment());
        else if (id == R.id.nav_users) showFragment(new UsersFragment());
        else if (id == R.id.nav_invites) showFragment(new InvitesFragment());
        else if (id == R.id.nav_history) showFragment(new HistoryFragment());
        else if (id == R.id.nav_company_settings) showFragment(new CompanySettingsFragment());
        else if (id == R.id.nav_available_cars) showFragment(new AvailableCarsFragment());
        else if (id == R.id.nav_my_reservations) showFragment(new MyReservationsFragment());
        else if (id == R.id.nav_incidents) showFragment(new IncidentsFragment());
        else if (id == R.id.nav_booking_calendar) showFragment(BookingCalendarFragment.newInstance(false));
        else if (id == R.id.nav_fleet_calendar) showFragment(BookingCalendarFragment.newInstance(true));
        else if (id == R.id.nav_driving_licence) showFragment(new DrivingLicenceFragment());
        else if (id == R.id.nav_audit_logs) showFragment(new AuditLogsFragment());
        return true;
    }
}

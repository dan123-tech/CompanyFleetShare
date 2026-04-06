# Car Sharing – Android App

Java Android app using **MVVM**, **Retrofit 2**, **OkHttp**, and **Material Design 3**, aligned with the existing web app.

## Requirements

- Android Studio (Ladybug or newer) or command line: JDK 17, Android SDK 34
- Backend web app running (e.g. `npm run dev` in the project root)

## Project structure

- **ui** – Activities and Fragments: `MainActivity`, `LoginActivity`, `DashboardFragment`, `CompanyFragment`, `CompanySettingsFragment`, `CarsFragment`, `UsersFragment`, `InvitesFragment`, `HistoryFragment`, `MyReservationsFragment`, `AvailableCarsFragment`, `DrivingLicenceFragment`, `StatisticsFragment`, `NoCompanyFragment`
- **data** – `repository` (`AuthRepository`), `preferences` (`SecureSessionPreferences` using EncryptedSharedPreferences, `SessionCookieStore` interface)
- **models** – DTOs matching the API (`User`, `Company`, `Car`, `Reservation` with `pickupCode`/`releaseCode`/`codeValidFrom`, etc.)
- **network** – `ApiService` (Retrofit), `RetrofitClient`, `SessionCookieInterceptor` (cookie + refresh persistence)

## Opening the project

1. Open Android Studio → **Open** → select the `android` folder.
2. Wait for Gradle sync (and wrapper download if needed).
3. Set **Build Configuration** to `app` and pick an emulator or device.

## API base URL (production / Vercel + Neon)

The Android app calls the **same HTTPS API** as the web app (your deployed Next.js server, which uses Neon or another Postgres).

1. Open **`android/gradle.properties`**.
2. Set **`fleetshareApiBaseUrl`** to your public site URL, including `https://` and a trailing slash is optional (the app normalizes it).

Example:

```properties
fleetshareApiBaseUrl=https://your-project.vercel.app/
```

3. Sync Gradle and rebuild. The value is compiled into **`R.string.api_base_url`**; there is no server URL field on the login screen.

For **local development** against `npm run dev`, temporarily point `fleetshareApiBaseUrl` at your machine (e.g. `http://10.0.2.2:3100/` on emulator or `http://192.168.x.x:3100/` on a phone). Use **http** only for dev; production should use **https**.

### Publishing the APK on the website

After you build a release APK, copy it to the web repo as **`public/downloads/fleetshare.apk`**. The Next.js site serves it at **`/downloads/fleetshare.apk`** and links it from the **Download** page. (Android uses **.apk**, not Windows **.exe**.)

## Authentication and security

- **Login** uses `POST /api/auth/login` (email + password). The backend sets a session cookie (`car_sharing_session`).
- The app stores the session cookie and user info in **EncryptedSharedPreferences** (via `SecureSessionPreferences`) and sends the cookie on every API call via `SessionCookieInterceptor`. Same cookie/refresh behavior as the web app.
- Admin-only menu items (Manage Cars, Manage Users, Invites, History, Company Settings, Statistics) are hidden for non-admin users.

## Features (1:1 with web)

- **Navigation Drawer:** Dashboard, Company, Manage Cars, Manage Users, Invites, History, Company Settings (admin), Statistics (admin), Available Cars, My Reservations, Profile / Driving licence, Logout.
- **Dashboard:** CardViews for Total Cars, Active Reservations, Team Members, Available Cars.
- **Company:** Join code display + **Share join code** (native share sheet).
- **Company Settings:** Default KM (fuel) per reservation.
- **Manage Cars:** FAB to add car; form: Brand, Registration number, Fuel type (Benzine/Diesel/Electric/Hybrid), Km, Consumption.
- **Manage Users:** RecyclerView (ListView) with **long-press** context menu: Promote/Demote to Admin, Remove; DL Approve/Reject.
- **Reservations:** List and create; API supports `startDate`/`endDate` for scheduled bookings and returns `pickupCode`/`releaseCode`/`codeValidFrom`. Time-window validation (30 min) and code display can be wired in `MyReservationsFragment` and `AvailableCarsFragment`.
- **Profile / Driving licence:** Upload before reserving; Reserve is enabled only when licence is approved (same as web).
- **Statistics:** Fragment present; **MPAndroidChart** is added as a dependency for Pie (fuel type) and Bar (monthly usage)—wire charts in `StatisticsFragment` to reservation/car data.
- **Verify pickup code:** `ApiService.verifyPickupCode(body)` for admin bypass and time-window checks.

## Theming

- **Primary:** `#1E293B` (Corporate Navy / Slate)
- **Accent:** `#3B82F6`
- Defined in `res/values/colors.xml` and `themes.xml`.

## Building from command line

From the `android` folder:

```bash
# Unix / Mac
./gradlew assembleDebug

# Windows
gradlew.bat assembleDebug
```

If the wrapper is missing, generate it with Gradle or open the project in Android Studio once to create it.

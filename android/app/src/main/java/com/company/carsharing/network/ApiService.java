package com.company.carsharing.network;

import com.company.carsharing.models.Car;
import com.company.carsharing.models.Company;
import com.company.carsharing.models.CompanyResponse;
import com.company.carsharing.models.Invite;
import com.company.carsharing.models.LoginRequest;
import com.company.carsharing.models.LoginResponse;
import com.company.carsharing.models.RegisterRequest;
import com.company.carsharing.models.RegisterResponse;
import com.company.carsharing.models.Member;
import com.company.carsharing.models.Reservation;
import com.company.carsharing.models.SessionResponse;
import com.company.carsharing.models.IncidentReport;
import com.company.carsharing.models.GloveboxActiveResponse;

import java.util.List;
import java.util.Map;

import okhttp3.MultipartBody;
import okhttp3.RequestBody;
import retrofit2.Call;
import retrofit2.http.Body;
import retrofit2.http.DELETE;
import retrofit2.http.GET;
import retrofit2.http.Multipart;
import retrofit2.http.PATCH;
import retrofit2.http.POST;
import retrofit2.http.Part;
import retrofit2.http.Path;
import retrofit2.http.Query;

public interface ApiService {

    // Auth
    @POST("api/auth/login")
    Call<LoginResponse> login(@Body LoginRequest request);
    @POST("api/auth/register")
    Call<RegisterResponse> register(@Body RegisterRequest request);
    @GET("api/auth/session")
    Call<SessionResponse> getSession();
    @POST("api/auth/logout")
    Call<Void> logout();

    /** Register FCM token for server-side booking reminders (optional; requires Firebase on the device). */
    @POST("api/users/me/push-token")
    Call<Map<String, Object>> registerPushToken(@Body Map<String, String> body);

    // Company
    @POST("api/companies")
    Call<CompanyResponse> createCompany(@Body Map<String, Object> body);
    @POST("api/companies/join")
    Call<CompanyResponse> joinCompany(@Body Map<String, String> body);
    @GET("api/companies/current")
    Call<CompanyResponse> getCompanyCurrent();
    @PATCH("api/companies/current")
    Call<Company> updateCompanyCurrent(@Body Map<String, Object> body);

    // Cars
    @GET("api/cars")
    Call<List<Car>> getCars(@Query("status") String status);
    @GET("api/cars")
    Call<List<Car>> getAllCars();
    @POST("api/cars")
    Call<Car> addCar(@Body Map<String, Object> body);
    @GET("api/cars/{id}")
    Call<Car> getCar(@Path("id") String id);
    @PATCH("api/cars/{id}")
    Call<Car> updateCar(@Path("id") String id, @Body Map<String, Object> body);
    @DELETE("api/cars/{id}")
    Call<Void> deleteCar(@Path("id") String id);

    // Users (company members)
    @GET("api/users")
    Call<List<Member>> getUsers(@Query("status") String status);
    @POST("api/users/invite")
    Call<Object> inviteUser(@Body Map<String, String> body);
    @PATCH("api/users/{id}")
    Call<Void> updateUser(@Path("id") String userId, @Body Map<String, Object> body);
    @DELETE("api/users/{id}")
    Call<Void> removeUser(@Path("id") String userId);
    @Multipart
    @POST("api/users/me/driving-licence")
    Call<Map<String, Object>> uploadDrivingLicence(@Part MultipartBody.Part file);

    // Invites
    @GET("api/invites")
    Call<List<Invite>> getInvites();

    // Reservations
    /** @param mine pass "1" to list only the current user's reservations (needed for admins on "My reservations"). */
    @GET("api/reservations")
    Call<List<Reservation>> getReservations(@Query("status") String status, @Query("mine") String mine);
    @GET("api/reservations/history")
    Call<List<Reservation>> getReservationHistory();
    @POST("api/reservations")
    Call<Reservation> createReservation(@Body Map<String, Object> body);
    @PATCH("api/reservations/{id}")
    Call<Map<String, Object>> updateReservation(@Path("id") String id, @Body Map<String, Object> body);
    @GET("api/reservations/pending-approvals")
    Call<List<Reservation>> getPendingExceededApprovals();
    @POST("api/reservations/verify-pickup-code")
    Call<Map<String, Object>> verifyPickupCode(@Body Map<String, Object> body);

    // Audit logs (admin only)
    @GET("api/audit-logs")
    Call<Map<String, Object>> getAuditLogs(
        @Query("page") int page,
        @Query("limit") int limit,
        @Query("entityType") String entityType
    );

    // Incidents
    @GET("api/incidents")
    Call<List<IncidentReport>> getIncidents();

    @Multipart
    @POST("api/incidents")
    Call<Map<String, Object>> createIncident(
            @Part("carId") RequestBody carId,
            @Part("title") RequestBody title,
            @Part("severity") RequestBody severity,
            @Part("occurredAt") RequestBody occurredAt,
            @Part("location") RequestBody location,
            @Part("description") RequestBody description,
            @Part List<MultipartBody.Part> files
    );

    // Glovebox (digital documents for active reservation)
    @GET("api/glovebox/active")
    Call<GloveboxActiveResponse> getGloveboxActive();
}

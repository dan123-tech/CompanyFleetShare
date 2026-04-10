package com.company.carsharing.models;

import com.google.gson.annotations.SerializedName;

import java.util.List;

/**
 * Matches GET /api/incidents JSON (camelCase). Gson ignores unknown fields.
 */
public class IncidentReport {
    @SerializedName("id")
    private String id;
    @SerializedName("companyId")
    private String companyId;
    @SerializedName("carId")
    private String carId;
    @SerializedName("userId")
    private String userId;
    @SerializedName("reservationId")
    private String reservationId;
    @SerializedName("occurredAt")
    private String occurredAt;
    @SerializedName("severity")
    private String severity;
    @SerializedName("title")
    private String title;
    @SerializedName("description")
    private String description;
    @SerializedName("location")
    private String location;
    @SerializedName("status")
    private String status;
    @SerializedName("adminNotes")
    private String adminNotes;
    @SerializedName("createdAt")
    private String createdAt;
    @SerializedName("car")
    private Car car;
    @SerializedName("user")
    private User user;
    @SerializedName("attachments")
    private List<IncidentAttachment> attachments;

    public String getId() { return id; }
    public String getCompanyId() { return companyId; }
    public String getCarId() { return carId; }
    public String getUserId() { return userId; }
    public String getReservationId() { return reservationId; }
    public String getOccurredAt() { return occurredAt; }
    public String getSeverity() { return severity; }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public String getLocation() { return location; }
    public String getStatus() { return status; }
    public String getAdminNotes() { return adminNotes; }
    public String getCreatedAt() { return createdAt; }
    public Car getCar() { return car; }
    public User getUser() { return user; }
    public List<IncidentAttachment> getAttachments() { return attachments; }
}


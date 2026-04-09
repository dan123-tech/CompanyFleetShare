package com.company.carsharing.models;

import java.util.List;

public class IncidentReport {
    private String id;
    private String companyId;
    private String carId;
    private String userId;
    private String reservationId;
    private String occurredAt;
    private String severity;
    private String title;
    private String description;
    private String location;
    private String status;
    private String adminNotes;
    private String createdAt;
    private Car car;
    private User user;
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


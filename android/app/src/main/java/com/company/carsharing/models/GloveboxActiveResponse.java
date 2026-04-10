package com.company.carsharing.models;

import com.google.gson.annotations.SerializedName;

public class GloveboxActiveResponse {
    @SerializedName("active")
    private boolean active;

    @SerializedName("reservationId")
    private String reservationId;

    @SerializedName("car")
    private GloveboxCar car;

    @SerializedName("brokerRenewalUrl")
    private String brokerRenewalUrl;

    public boolean isActive() {
        return active;
    }

    public String getReservationId() {
        return reservationId;
    }

    public GloveboxCar getCar() {
        return car;
    }

    public String getBrokerRenewalUrl() {
        return brokerRenewalUrl;
    }

    public static class GloveboxCar {
        @SerializedName("id")
        private String id;

        @SerializedName("label")
        private String label;

        @SerializedName("registrationNumber")
        private String registrationNumber;

        @SerializedName("itpExpiresAt")
        private String itpExpiresAt;

        @SerializedName("rcaExpiresAt")
        private String rcaExpiresAt;

        @SerializedName("rcaDocumentUrl")
        private String rcaDocumentUrl;

        @SerializedName("rcaDocumentContentType")
        private String rcaDocumentContentType;

        @SerializedName("vignetteExpiresAt")
        private String vignetteExpiresAt;

        public String getId() {
            return id;
        }

        public String getLabel() {
            return label;
        }

        public String getRegistrationNumber() {
            return registrationNumber;
        }

        public String getItpExpiresAt() {
            return itpExpiresAt;
        }

        public String getRcaExpiresAt() {
            return rcaExpiresAt;
        }

        public String getRcaDocumentUrl() {
            return rcaDocumentUrl;
        }

        public String getRcaDocumentContentType() {
            return rcaDocumentContentType;
        }

        public String getVignetteExpiresAt() {
            return vignetteExpiresAt;
        }
    }
}


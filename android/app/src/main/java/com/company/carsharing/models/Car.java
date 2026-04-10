package com.company.carsharing.models;

import com.google.gson.annotations.SerializedName;

public class Car {
    @SerializedName("id")
    private String id;
    @SerializedName("brand")
    private String brand;
    @SerializedName("model")
    private String model;
    @SerializedName("registrationNumber")
    private String registrationNumber;
    @SerializedName("vehicleCategory")
    private String vehicleCategory;
    @SerializedName("km")
    private Integer km;
    @SerializedName("status")
    private String status;
    @SerializedName("fuelType")
    private String fuelType;
    @SerializedName("averageConsumptionL100km")
    private Double averageConsumptionL100km;
    @SerializedName("averageConsumptionKwh100km")
    private Double averageConsumptionKwh100km;

    public String getId() { return id; }
    public String getBrand() { return brand; }
    public String getModel() { return model; }
    public String getRegistrationNumber() { return registrationNumber; }
    public String getVehicleCategory() { return vehicleCategory; }
    public int getKm() { return km != null ? km : 0; }
    public String getStatus() { return status; }
    public String getFuelType() { return fuelType; }
    public Double getAverageConsumptionL100km() { return averageConsumptionL100km; }
    public Double getAverageConsumptionKwh100km() { return averageConsumptionKwh100km; }
}

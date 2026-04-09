package com.company.carsharing.models;

public class IncidentAttachment {
    private String id;
    private String kind;
    private String filename;
    private String contentType;
    private Integer sizeBytes;
    private String url;
    private String createdAt;

    public String getId() { return id; }
    public String getKind() { return kind; }
    public String getFilename() { return filename; }
    public String getContentType() { return contentType; }
    public Integer getSizeBytes() { return sizeBytes; }
    public String getUrl() { return url; }
    public String getCreatedAt() { return createdAt; }
}


package com.company.carsharing.util;

import android.os.Build;

import java.text.DateFormat;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.FormatStyle;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Parses API ISO-8601 date strings to epoch millis (UTC-aware when possible).
 */
public final class DateParseUtil {

    private DateParseUtil() {}

    /** True if {@code t} has Z or a trailing ±HH:MM offset (not the date part). */
    private static boolean hasExplicitOffset(String t) {
        if (t.endsWith("Z")) return true;
        int len = t.length();
        if (len >= 6) {
            char c = t.charAt(len - 6);
            if ((c == '+' || c == '-') && t.charAt(len - 3) == ':') {
                return true;
            }
        }
        return false;
    }

    /**
     * If the string is an ISO datetime without zone, treat as UTC (common for JSON from the server).
     */
    private static String assumeUtcIfDatetimeMissingZone(String t) {
        if (t.length() < 19 || t.charAt(10) != 'T' || hasExplicitOffset(t)) {
            return t;
        }
        return t + "Z";
    }

    public static long parseIsoToMillis(String s) {
        if (s == null || s.trim().isEmpty()) return -1L;
        String t = s.trim();

        // Calendar date only
        if (t.matches("\\d{4}-\\d{2}-\\d{2}")) {
            try {
                SimpleDateFormat in = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
                in.setLenient(false);
                in.setTimeZone(TimeZone.getTimeZone("UTC"));
                Date d = in.parse(t);
                return d != null ? d.getTime() : -1L;
            } catch (ParseException e) {
                return -1L;
            }
        }

        t = assumeUtcIfDatetimeMissingZone(t);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                return Instant.parse(t).toEpochMilli();
            } catch (Exception ignored) {
                // fall through
            }
            try {
                return OffsetDateTime.parse(t).toInstant().toEpochMilli();
            } catch (Exception ignored) {
                // fall through
            }
        }
        String[] patterns = new String[]{
                "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
                "yyyy-MM-dd'T'HH:mm:ssXXX",
                "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
                "yyyy-MM-dd'T'HH:mm:ss'Z'",
                "yyyy-MM-dd'T'HH:mm:ss.SSS",
                "yyyy-MM-dd'T'HH:mm:ss",
        };
        for (String p : patterns) {
            try {
                SimpleDateFormat fmt = new SimpleDateFormat(p, Locale.US);
                if (p.contains("'Z'") || (!p.contains("XXX") && t.endsWith("Z"))) {
                    fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
                }
                return fmt.parse(t).getTime();
            } catch (ParseException ignored) {
            }
        }
        return -1L;
    }

    /**
     * Formats an API ISO string for UI. Date-only values use the calendar day (no timezone shift).
     * Date-times use the device locale and local timezone.
     */
    public static String formatIsoForDisplay(String iso, Locale locale) {
        if (iso == null || iso.trim().isEmpty()) return "";
        String t = iso.trim();
        Locale loc = locale != null ? locale : Locale.getDefault();

        if (t.matches("\\d{4}-\\d{2}-\\d{2}")) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    LocalDate d = LocalDate.parse(t);
                    return DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(loc).format(d);
                }
                SimpleDateFormat in = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
                in.setLenient(false);
                in.setTimeZone(TimeZone.getTimeZone("UTC"));
                Date d = in.parse(t);
                if (d == null) return t;
                DateFormat df = DateFormat.getDateInstance(DateFormat.MEDIUM, loc);
                df.setTimeZone(TimeZone.getTimeZone("UTC"));
                return df.format(d);
            } catch (Exception e) {
                return t;
            }
        }

        long ms = parseIsoToMillis(t);
        if (ms < 0) {
            return t.replace('T', ' ').replaceAll("\\.\\d+Z?$", "").replaceAll("Z$", "").trim();
        }
        DateFormat df = DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT, loc);
        return df.format(new Date(ms));
    }
}

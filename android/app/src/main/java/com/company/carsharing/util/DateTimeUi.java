package com.company.carsharing.util;

import android.content.Context;

import java.util.Locale;

/**
 * Locale-aware formatting of API date/time strings for list rows and short UI.
 */
public final class DateTimeUi {
    private DateTimeUi() {}

    public static String format(String raw) {
        return format(raw, Locale.getDefault());
    }

    public static String format(String raw, Context context) {
        if (context == null) return format(raw);
        Locale loc = context.getResources().getConfiguration().getLocales().get(0);
        return format(raw, loc);
    }

    public static String format(String raw, Locale locale) {
        if (raw == null) return "";
        String s = raw.trim();
        if (s.isEmpty()) return "";
        return DateParseUtil.formatIsoForDisplay(s, locale);
    }
}

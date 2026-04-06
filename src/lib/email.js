/**
 * Transactional email from a no-reply style address.
 *
 * Uses Resend’s REST API (no extra package): https://resend.com
 * 1. Create API key, verify your domain (SPF/DKIM handled by Resend).
 * 2. Set RESEND_API_KEY, EMAIL_FROM (e.g. no-reply@yourdomain.com), optional EMAIL_FROM_NAME.
 * 3. Set NEXT_PUBLIC_APP_URL so logos and footer links resolve (absolute URLs required in email).
 *
 * Optional: EMAIL_LOGO_URL — full URL to a PNG logo (better Gmail support than SVG).
 */

const RESEND_API = "https://api.resend.com/emails";

/** Primary + footer logos (SVG). For strict Gmail compatibility, set EMAIL_LOGO_URL to a hosted PNG. */
const LOGO_PATH_FULL = "/brand/fleetshare-logo-dark.svg";
const LOGO_PATH_MARK = "/brand/fleetshare-mark-light.svg";

function fromAddress() {
  const name = (process.env.EMAIL_FROM_NAME || "FleetShare").trim();
  const email = (process.env.EMAIL_FROM || "").trim();
  if (!email) return null;
  return `${name} <${email}>`;
}

/**
 * Public site origin for links and images (no trailing slash).
 */
function getPublicBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.EMAIL_PUBLIC_SITE_URL || "").replace(/\/$/, "");
}

function absoluteUrl(pathOrUrl) {
  const base = getPublicBaseUrl();
  if (!base) return null;
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) return pathOrUrl;
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

/**
 * Escape text used inside HTML email bodies.
 * @param {unknown} s
 */
export function escapeEmailText(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Wrap inner HTML in a branded layout (logo header, footer with mark + website).
 * @param {{ innerHtml: string, preheader?: string }} opts
 */
function wrapBrandedEmailHtml({ innerHtml, preheader = "" }) {
  const base = getPublicBaseUrl();
  const logoOverride = process.env.EMAIL_LOGO_URL?.trim();
  const logoFull = logoOverride || (base ? absoluteUrl(LOGO_PATH_FULL) : null);
  const logoMark = base ? absoluteUrl(LOGO_PATH_MARK) : null;
  const safeBase = base ? escapeEmailText(base) : "";
  const displayHost = base ? escapeEmailText(base.replace(/^https?:\/\//, "")) : "FleetShare";
  const pre = escapeEmailText(preheader).slice(0, 200);

  const headerBlock = logoFull
    ? `<img src="${escapeEmailText(logoFull)}" alt="FleetShare" width="260" height="87" style="display:block;margin:0 auto;max-width:260px;height:auto;width:100%;" />`
    : `<div style="font-size:24px;font-weight:700;color:#0f172a;letter-spacing:-0.02em;">FleetShare</div>`;

  const footerLink = base
    ? `<a href="${safeBase}" style="color:#7dd3fc;text-decoration:none;font-weight:600;">${displayHost}</a>`
    : `<span style="color:#94a3b8;">FleetShare</span>`;

  const footerMark = logoMark
    ? `<img src="${escapeEmailText(logoMark)}" alt="" width="44" height="44" style="display:block;margin:0 auto 14px;border:0;" />`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="x-ua-compatible" content="ie=edge" />
  <title>FleetShare</title>
</head>
<body style="margin:0;padding:0;background-color:#e2e8f0;-webkit-font-smoothing:antialiased;">
  ${pre ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${pre}</div>` : ""}
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#e2e8f0;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
          <tr>
            <td style="padding:32px 28px 20px;text-align:center;border-bottom:1px solid #e2e8f0;">
              ${headerBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 36px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:16px;line-height:1.65;color:#334155;">
              ${innerHtml}
            </td>
          </tr>
          <tr>
            <td style="background-color:#0f172a;padding:28px 24px;text-align:center;">
              ${footerMark}
              <p style="margin:0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.5;">
                ${footerLink}
              </p>
              <p style="margin:10px 0 0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#94a3b8;letter-spacing:0.04em;text-transform:uppercase;">
                Company car sharing
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-size:11px;color:#64748b;max-width:560px;">
          You received this email because of your FleetShare account or a company invitation.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function brandedTextFooter() {
  const base = getPublicBaseUrl();
  const line = base ? `\n\n—\n${base}` : "";
  return line;
}

function buttonHtml(href, label) {
  const h = escapeEmailText(href);
  const l = escapeEmailText(label);
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;"><tr><td style="border-radius:10px;background-color:#0369a1;">
    <a href="${h}" style="display:inline-block;padding:14px 28px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${l}</a>
  </td></tr></table>`;
}

/**
 * @param {{ to: string | string[], subject: string, html?: string, text?: string, replyTo?: string }} opts
 * @returns {Promise<{ ok: boolean, id?: string, error?: string }>}
 */
export async function sendEmail({ to, subject, html, text, replyTo }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = fromAddress();

  if (!apiKey || !from) {
    return { ok: false, error: "not_configured" };
  }

  const toList = Array.isArray(to) ? to : [to];

  const body = {
    from,
    to: toList,
    subject,
    ...(html ? { html } : {}),
    ...(text ? { text } : {}),
    ...(replyTo ? { reply_to: replyTo } : {}),
  };

  if (!body.html && !body.text) {
    return { ok: false, error: "missing_body" };
  }

  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = data?.message || data?.error || res.statusText || "send_failed";
    return { ok: false, error: String(msg) };
  }

  const id = data?.id;
  return { ok: true, id };
}

/**
 * Invite email with optional join link (set NEXT_PUBLIC_APP_URL for a full URL).
 */
export async function sendInviteEmail({ to, token, inviteeName }) {
  const base = getPublicBaseUrl();
  const link = base ? `${base}/register?invite=${encodeURIComponent(token)}` : null;
  const greeting = inviteeName ? `Hi ${inviteeName},` : "Hi,";
  const safeName = inviteeName ? escapeEmailText(inviteeName) : "";

  const text = [
    greeting,
    "",
    "You’ve been invited to join the company on FleetShare.",
    link ? `Open this link to accept and set your password:\n${link}` : `Your invite token (paste where the app asks for it):\n${token}`,
    "",
    "If you didn’t expect this, you can ignore this email.",
    brandedTextFooter(),
  ].join("\n");

  const innerHtml = `
    <p style="margin:0 0 16px;font-size:18px;font-weight:600;color:#0f172a;">${safeName ? `Hi ${safeName},` : "Hi,"}</p>
    <p style="margin:0 0 16px;">You’ve been invited to join your company on <strong style="color:#0f172a;">FleetShare</strong> — shared company vehicles, reservations, and fleet tools in one place.</p>
    ${
      link
        ? `${buttonHtml(link, "Accept invitation & set password")}<p style="margin:16px 0 0;font-size:13px;color:#64748b;">Or copy this link into your browser:<br /><span style="word-break:break-all;color:#0369a1;">${escapeEmailText(link)}</span></p>`
        : `<p style="margin:0 0 8px;font-weight:600;color:#0f172a;">Your invite token</p><pre style="margin:0;padding:14px;background:#f1f5f9;border-radius:8px;font-size:13px;word-break:break-all;">${escapeEmailText(token)}</pre>`
    }
    <p style="margin:24px 0 0;font-size:14px;color:#64748b;">If you didn’t expect this message, you can ignore it.</p>
  `.trim();

  const html = wrapBrandedEmailHtml({
    innerHtml,
    preheader: "You’re invited to join your company on FleetShare.",
  });

  return sendEmail({ to, subject: "You’re invited to FleetShare", html, text });
}

/**
 * Sent after self-service registration.
 */
export async function sendWelcomeEmail({ to, name }) {
  const base = getPublicBaseUrl();
  const signIn = base ? `${base}/login` : null;
  const greeting = name?.trim() ? `Hi ${name.trim()},` : "Hi,";
  const safeName = name?.trim() ? escapeEmailText(name.trim()) : "";

  const text = [
    greeting,
    "",
    "Your FleetShare account is ready. Sign in with the email you used to register.",
    "",
    "Optional: after you log in, you can turn on email sign-in codes (MFA) under Dashboard → Security.",
    "",
    "If you didn’t create this account, you can ignore this email.",
    brandedTextFooter(),
  ].join("\n");

  const innerHtml = `
    <p style="margin:0 0 16px;font-size:18px;font-weight:600;color:#0f172a;">${safeName ? `Hi ${safeName},` : "Hi,"}</p>
    <p style="margin:0 0 16px;">Your <strong>FleetShare</strong> account is ready. Use the email you registered with to sign in anytime.</p>
    ${signIn ? buttonHtml(signIn, "Sign in to FleetShare") : ""}
    <div style="margin:24px 0;padding:16px 18px;background:#f8fafc;border-radius:10px;border-left:4px solid #0369a1;">
      <p style="margin:0;font-size:14px;color:#475569;"><strong style="color:#0f172a;">Tip:</strong> After you log in, you can enable email sign-in codes (MFA) under <strong>Dashboard → Security</strong> for extra protection.</p>
    </div>
    <p style="margin:20px 0 0;font-size:14px;color:#64748b;">If you didn’t create this account, you can ignore this email.</p>
  `.trim();

  const html = wrapBrandedEmailHtml({
    innerHtml,
    preheader: "Your FleetShare account is ready.",
  });

  return sendEmail({ to, subject: "Welcome to FleetShare", html, text });
}

/**
 * Sent when an admin creates a user account with a password the admin chose.
 */
export async function sendAdminCreatedAccountEmail({ to, name }) {
  const base = getPublicBaseUrl();
  const signInLink = base ? `${base}/login` : null;
  const greeting = name?.trim() ? `Hi ${name.trim()},` : "Hi,";
  const safeName = name?.trim() ? escapeEmailText(name.trim()) : "";

  const text = [
    greeting,
    "",
    "An administrator created a FleetShare account for you.",
    "Sign in with the email address this message was sent to and the password your administrator gave you.",
    "On first sign-in you will be asked to choose a new password before using the app.",
    "",
    signInLink ? `Sign in: ${signInLink}` : "Open FleetShare and go to the sign-in page.",
    "",
    "If you didn’t expect this, contact your company administrator.",
    brandedTextFooter(),
  ].join("\n");

  const innerHtml = `
    <p style="margin:0 0 16px;font-size:18px;font-weight:600;color:#0f172a;">${safeName ? `Hi ${safeName},` : "Hi,"}</p>
    <p style="margin:0 0 16px;">An administrator created a <strong>FleetShare</strong> account for your company.</p>
    <ol style="margin:0 0 20px;padding-left:20px;color:#475569;">
      <li style="margin-bottom:8px;">Sign in with <strong>this email address</strong> and the <strong>password your administrator shared with you</strong>.</li>
      <li>On first sign-in you’ll be asked to <strong>choose your own password</strong> before continuing.</li>
    </ol>
    ${signInLink ? buttonHtml(signInLink, "Sign in to FleetShare") : ""}
    <p style="margin:20px 0 0;font-size:14px;color:#64748b;">If you didn’t expect this, contact your company administrator.</p>
  `.trim();

  const html = wrapBrandedEmailHtml({
    innerHtml,
    preheader: "Your FleetShare account is ready — sign in and set your password.",
  });

  return sendEmail({ to, subject: "Your FleetShare account is ready — set your password", html, text });
}

function formatReservationWhen(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return String(iso);
  }
}

/**
 * Sent when a user creates a reservation (local DB).
 */
export async function sendReservationConfirmationEmail({ to, name, reservation }) {
  const greeting = name?.trim() ? `Hi ${name.trim()},` : "Hi,";
  const safeName = name?.trim() ? escapeEmailText(name.trim()) : "";
  const car = reservation?.car;
  const carLabel = car
    ? [car.brand, car.model, car.registrationNumber].filter(Boolean).join(" ").trim() || reservation.carId
    : reservation?.carId || "—";
  const pickup = reservation?.pickup_code ?? "—";
  const release = reservation?.release_code ?? "— (shown in the app when you return the vehicle)";
  const validFrom = formatReservationWhen(reservation?.code_valid_from ?? reservation?.startDate);
  const start = formatReservationWhen(reservation?.startDate);
  const end = formatReservationWhen(reservation?.endDate);
  const purpose = reservation?.purpose?.trim() || "—";

  const text = [
    greeting,
    "",
    "Your reservation is confirmed.",
    "",
    `Vehicle: ${carLabel}`,
    `Start: ${start}`,
    `End: ${end}`,
    `Purpose: ${purpose}`,
    "",
    `Pickup code: ${pickup}`,
    `Code valid from: ${validFrom}`,
    `Release code: ${release}`,
    "",
    "Keep this email for reference, or open FleetShare to see live details.",
    brandedTextFooter(),
  ].join("\n");

  const innerHtml = `
    <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#0f172a;">${safeName ? `Hi ${safeName},` : "Hi,"}</p>
    <p style="margin:0 0 24px;font-size:17px;color:#0369a1;font-weight:600;">Your reservation is confirmed</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;font-size:15px;">
      <tr><td style="padding:10px 12px 10px 0;color:#64748b;vertical-align:top;width:38%;">Vehicle</td><td style="padding:10px 0;vertical-align:top;"><strong style="color:#0f172a;">${escapeEmailText(carLabel)}</strong></td></tr>
      <tr><td style="padding:10px 12px 10px 0;color:#64748b;border-top:1px solid #e2e8f0;">Start</td><td style="padding:10px 0;border-top:1px solid #e2e8f0;">${escapeEmailText(start)}</td></tr>
      <tr><td style="padding:10px 12px 10px 0;color:#64748b;border-top:1px solid #e2e8f0;">End</td><td style="padding:10px 0;border-top:1px solid #e2e8f0;">${escapeEmailText(end)}</td></tr>
      <tr><td style="padding:10px 12px 10px 0;color:#64748b;border-top:1px solid #e2e8f0;">Purpose</td><td style="padding:10px 0;border-top:1px solid #e2e8f0;">${escapeEmailText(purpose)}</td></tr>
      <tr><td style="padding:10px 12px 10px 0;color:#64748b;border-top:1px solid #e2e8f0;">Pickup code</td><td style="padding:10px 0;border-top:1px solid #e2e8f0;"><span style="font-size:22px;font-weight:700;letter-spacing:4px;font-family:ui-monospace,Consolas,monospace;color:#0369a1;">${escapeEmailText(String(pickup))}</span></td></tr>
      <tr><td style="padding:10px 12px 10px 0;color:#64748b;border-top:1px solid #e2e8f0;">Code valid from</td><td style="padding:10px 0;border-top:1px solid #e2e8f0;">${escapeEmailText(validFrom)}</td></tr>
      <tr><td style="padding:10px 12px 10px 0;color:#64748b;border-top:1px solid #e2e8f0;">Release code</td><td style="padding:10px 0;border-top:1px solid #e2e8f0;">${escapeEmailText(String(release))}</td></tr>
    </table>
    <p style="margin:24px 0 0;font-size:14px;color:#64748b;">Open FleetShare anytime for live trip details and updates.</p>
  `.trim();

  const html = wrapBrandedEmailHtml({
    innerHtml,
    preheader: `Reservation confirmed — ${carLabel}`,
  });

  return sendEmail({ to, subject: "Reservation confirmed — FleetShare", html, text });
}

/**
 * 6-digit code after password when MFA is enabled.
 */
export async function sendMfaLoginCodeEmail({ to, code }) {
  const c = escapeEmailText(String(code));
  const text = [
    "Your FleetShare sign-in code is:",
    "",
    String(code),
    "",
    "It expires in 10 minutes. If you didn’t try to sign in, ignore this email.",
    brandedTextFooter(),
  ].join("\n");

  const innerHtml = `
    <p style="margin:0 0 12px;font-size:17px;color:#0f172a;font-weight:600;">Sign-in verification</p>
    <p style="margin:0 0 20px;color:#475569;">Use this code to finish signing in to FleetShare. It expires in <strong>10 minutes</strong>.</p>
    <div style="margin:0 0 24px;padding:22px 20px;text-align:center;background:linear-gradient(135deg,#f0f9ff 0%,#e0f2fe 100%);border-radius:12px;border:1px solid #bae6fd;">
      <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#0369a1;text-transform:uppercase;letter-spacing:0.12em;">Your code</p>
      <p style="margin:0;font-size:34px;font-weight:800;letter-spacing:10px;font-family:ui-monospace,Consolas,monospace;color:#0f172a;">${c}</p>
    </div>
    <p style="margin:0;font-size:14px;color:#64748b;">If you didn’t try to sign in, you can ignore this email — your password was not used without this code.</p>
  `.trim();

  const html = wrapBrandedEmailHtml({
    innerHtml,
    preheader: `Your FleetShare code: ${code}`,
  });

  return sendEmail({ to, subject: "Your FleetShare sign-in code", html, text });
}

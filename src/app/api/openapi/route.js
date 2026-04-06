/**
 * GET /api/openapi – OpenAPI 3.0 spec for Swagger UI
 */

import { NextResponse } from "next/server";

export async function GET() {
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3100";
  const spec = {
    openapi: "3.0.0",
    info: {
      title: "Company Car Sharing API",
      version: "1.0.0",
      description: "REST API for Company Car Sharing. Auth via session cookie.",
    },
    servers: [{ url: baseUrl }],
    tags: [
      { name: "Auth" },
      { name: "Companies" },
      { name: "Users" },
      { name: "Cars" },
      { name: "Reservations" },
    ],
    paths: {
      "/api/auth/login": {
        post: {
          tags: ["Auth"],
          summary: "Login",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password"],
                  properties: {
                    email: { type: "string", format: "email" },
                    password: { type: "string" },
                    clientType: {
                      type: "string",
                      enum: ["web", "mobile"],
                      description: "Session channel; default web. New login revokes other sessions on the same channel only.",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Success", content: { "application/json": { schema: { type: "object", properties: { user: { type: "object" }, company: { type: "object" } } } } } },
            "401": { description: "Invalid credentials" },
          },
        },
      },
      "/api/auth/logout": {
        post: { tags: ["Auth"], summary: "Logout", responses: { "200": { description: "OK" } } },
      },
      "/api/auth/session": {
        get: { tags: ["Auth"], summary: "Current session", responses: { "200": { description: "User + company" }, "401": { description: "Unauthorized" } } },
      },
      "/api/auth/register": {
        post: {
          tags: ["Auth"],
          summary: "Register (self-signup, no invite)",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password", "name"],
                  properties: {
                    email: { type: "string", format: "email" },
                    password: { type: "string", minLength: 8 },
                    name: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { "201": { description: "Created" }, "409": { description: "Email already registered" } },
        },
      },
      "/api/auth/set-password": {
        post: {
          tags: ["Auth"],
          summary: "Set password (invite token)",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["token", "newPassword"],
                  properties: { token: { type: "string" }, newPassword: { type: "string", minLength: 8 } },
                },
              },
            },
          },
          responses: { "200": { description: "OK" }, "400": { description: "Invalid/expired token" } },
        },
      },
      "/api/companies": {
        post: {
          tags: ["Companies"],
          summary: "Create company (user becomes ADMIN, gets joinCode)",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name"],
                  properties: { name: { type: "string" }, domain: { type: "string", nullable: true } },
                },
              },
            },
          },
          responses: { "201": { description: "Company created" }, "401": { description: "Unauthorized" } },
        },
      },
      "/api/companies/join": {
        post: {
          tags: ["Companies"],
          summary: "Join company by join code",
          requestBody: {
            content: {
              "application/json": {
                schema: { type: "object", required: ["joinCode"], properties: { joinCode: { type: "string" } } },
              },
            },
          },
          responses: { "200": { description: "Joined" }, "400": { description: "Invalid code or already member" }, "401": { description: "Unauthorized" } },
        },
      },
      "/api/companies/current": {
        get: { tags: ["Companies"], summary: "Get current company (null if not in one)", responses: { "200": { description: "Company or { company: null }" }, "401": { description: "Unauthorized" } } },
        patch: {
          tags: ["Companies"],
          summary: "Update company (admin)",
          requestBody: { content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" }, domain: { type: "string", nullable: true } } } } } },
          responses: { "200": { description: "Updated" }, "403": { description: "Forbidden" } },
        },
      },
      "/api/users": {
        get: {
          tags: ["Users"],
          summary: "List company members",
          parameters: [{ name: "status", in: "query", schema: { type: "string", enum: ["ENROLLED", "PENDING_INVITE"] } }],
          responses: { "200": { description: "List of members" } },
        },
      },
      "/api/invites": {
        get: {
          tags: ["Users"],
          summary: "List company invites (admin)",
          responses: { "200": { description: "List of invites (email, status: pending/joined/expired)" } },
        },
      },
      "/api/users/invite": {
        post: {
          tags: ["Users"],
          summary: "Invite user (admin)",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email"],
                  properties: { email: { type: "string", format: "email" }, name: { type: "string" }, role: { type: "string", enum: ["ADMIN", "USER"] } },
                },
              },
            },
          },
          responses: { "201": { description: "Invite created" } },
        },
      },
      "/api/users/{id}": {
        patch: {
          tags: ["Users"],
          summary: "Update member role (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: { content: { "application/json": { schema: { type: "object", required: ["role"], properties: { role: { type: "string", enum: ["ADMIN", "USER"] } } } } } },
          responses: { "200": { description: "Updated" }, "404": { description: "Not found" } },
        },
        delete: {
          tags: ["Users"],
          summary: "Remove member (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Removed" }, "404": { description: "Not found" } },
        },
      },
      "/api/cars": {
        get: {
          tags: ["Cars"],
          summary: "List cars",
          parameters: [{ name: "status", in: "query", schema: { type: "string", enum: ["AVAILABLE", "RESERVED", "IN_MAINTENANCE"] } }],
          responses: { "200": { description: "List of cars" } },
        },
        post: {
          tags: ["Cars"],
          summary: "Create car (admin)",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["brand", "registrationNumber"],
                  properties: {
                    brand: { type: "string" },
                    model: { type: "string", nullable: true },
                    registrationNumber: { type: "string" },
                    km: { type: "integer", minimum: 0 },
                    status: { type: "string", enum: ["AVAILABLE", "RESERVED", "IN_MAINTENANCE"] },
                  },
                },
              },
            },
          },
          responses: { "201": { description: "Created" } },
        },
      },
      "/api/cars/{id}": {
        get: {
          tags: ["Cars"],
          summary: "Get car (admin sees reservation history)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Car" }, "404": { description: "Not found" } },
        },
        patch: {
          tags: ["Cars"],
          summary: "Update car (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: { content: { "application/json": { schema: { type: "object", properties: { brand: { type: "string" }, model: { type: "string" }, registrationNumber: { type: "string" }, km: { type: "integer" }, status: { type: "string" } } } } } },
          responses: { "200": { description: "Updated" }, "404": { description: "Not found" } },
        },
        delete: {
          tags: ["Cars"],
          summary: "Delete car (admin)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Deleted" }, "404": { description: "Not found" } },
        },
      },
      "/api/reservations": {
        get: {
          tags: ["Reservations"],
          summary: "List reservations",
          parameters: [
            { name: "status", in: "query", schema: { type: "string", enum: ["ACTIVE", "COMPLETED", "CANCELLED"] } },
            { name: "carId", in: "query", schema: { type: "string" } },
            {
              name: "mine",
              in: "query",
              description: "If 1, return only the current user's reservations (including when role is ADMIN).",
              schema: { type: "string", enum: ["1", "true"] },
            },
          ],
          responses: { "200": { description: "List" } },
        },
        post: {
          tags: ["Reservations"],
          summary: "Create reservation",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["carId", "startDate", "endDate"],
                  properties: {
                    carId: { type: "string" },
                    startDate: { type: "string", format: "date-time" },
                    endDate: { type: "string", format: "date-time" },
                    purpose: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
          responses: { "201": { description: "Created" }, "409": { description: "Overlap" } },
        },
      },
      "/api/reservations/history": {
        get: { tags: ["Reservations"], summary: "My reservation history", responses: { "200": { description: "List" } } },
      },
      "/api/reservations/{id}": {
        patch: {
          tags: ["Reservations"],
          summary: "Cancel, release (complete), or extend reservation",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    { type: "object", required: ["action"], properties: { action: { type: "string", enum: ["cancel"] } } },
                    { type: "object", required: ["action"], properties: { action: { type: "string", enum: ["release"] } } },
                    { type: "object", required: ["action", "endDate"], properties: { action: { type: "string", enum: ["extend"] }, endDate: { type: "string", format: "date-time" } } },
                  ],
                },
              },
            },
          },
          responses: { "200": { description: "OK" }, "403": { description: "Forbidden" }, "409": { description: "Overlap" } },
        },
      },
    },
  };
  return NextResponse.json(spec);
}

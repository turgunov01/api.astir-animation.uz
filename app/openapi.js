export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Astir API",
    version: "0.1.0",
    description: "Local API docs for testing the Astir backend."
  },
  servers: [
    {
      url: "/",
      description: "Current server"
    }
  ],
  tags: [
    { name: "Health" },
    { name: "Auth" },
    { name: "Children" },
    { name: "Pairing" },
    { name: "Device" },
    { name: "Tariffs" },
    { name: "Billing" },
    { name: "Movies" },
    { name: "Categories" },
    { name: "Watch Sessions" }
  ],
  components: {
    securitySchemes: {
      parentToken: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      },
      deviceToken: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      },
      legacyBearer: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      }
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string", example: "VALIDATION_ERROR" },
              message: { type: "string", example: "Email is required" },
              requestId: { type: "string", example: "7d13c3a7-07d0-4f99-81a1-fb2efc42d1d8" }
            }
          }
        }
      },
      LocalizedText: {
        type: "object",
        required: ["en", "ru", "uz"],
        properties: {
          en: { type: "string", example: "Cartoons" },
          ru: { type: "string", example: "Мультфильмы" },
          uz: { type: "string", example: "Multfilmlar" }
        },
        additionalProperties: false
      },
      Parent: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string", example: "Parent" },
          email: { type: "string", example: "parent@example.com" },
          tariff: { type: "string", example: "free" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      LegacyUser: {
        type: "object",
        properties: {
          id: { type: "string" },
          email: { type: "string", example: "parent@example.com" },
          name: { type: "string", example: "Parent" },
          last_name: { type: "string", example: "User" },
          phone: { type: "string", nullable: true },
          role: { type: "string", example: "parent" },
          active: { type: "boolean", example: true },
          avatar_url: { type: "string", example: "" },
          last_login_at: { type: "string", format: "date-time", nullable: true },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" }
        }
      },
      LegacyTokenPair: {
        type: "object",
        properties: {
          access_token: { type: "string" },
          access_expires_at: { type: "string", format: "date-time" },
          refresh_token: { type: "string" },
          refresh_expires_at: { type: "string", format: "date-time" },
          user: { $ref: "#/components/schemas/LegacyUser" }
        }
      },
      LegacyI18nMessage: {
        type: "object",
        properties: {
          uz: { type: "string", example: "Email yoki parol noto'g'ri. Iltimos, qayta tekshiring." },
          ru: { type: "string", example: "Неверный email или пароль. Пожалуйста, проверьте данные." },
          en: { type: "string", example: "Incorrect email or password. Please check your credentials." }
        }
      },
      LegacyErrorResponse: {
        type: "object",
        properties: {
          error: { type: "string", example: "invalid credentials" },
          message: { $ref: "#/components/schemas/LegacyI18nMessage" }
        }
      },
      LegacyOkResponse: {
        type: "object",
        properties: {
          message: { type: "string", example: "ok" }
        }
      },
      LegacyOtpRequestResult: {
        type: "object",
        properties: {
          debug_code: { type: "string", example: "" },
          email: { type: "string", example: "user@example.com" },
          expires_at: { type: "string", format: "date-time" }
        }
      },
      LegacyOtpVerifyResult: {
        type: "object",
        properties: {
          access_expires_at: { type: "string", format: "date-time" },
          access_token: { type: "string" },
          email: { type: "string", example: "user@example.com" },
          refresh_expires_at: { type: "string", format: "date-time" },
          refresh_token: { type: "string" },
          user: {
            nullable: true,
            allOf: [{ $ref: "#/components/schemas/LegacyUser" }]
          },
          user_exists: { type: "boolean", example: true }
        }
      },
      LegacyChild: {
        type: "object",
        properties: {
          id: { type: "string", example: "b219a2f6-0670-44ed-8e18-57f887bd4e94" },
          parent_id: { type: "string", example: "5ca2bf5b-6e18-472e-b7c0-ed37b951e76d" },
          name: { type: "string", example: "Child" },
          age: { type: "integer", example: 7 },
          avatar_url: { type: "string", example: "" },
          active: { type: "boolean", example: true },
          extended_until: { type: "string", format: "date-time", nullable: true },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" }
        }
      },
      LegacyPairingTicket: {
        type: "object",
        properties: {
          device_id: { type: "string", example: "3c52a843-0681-433c-a51e-c2f399dc4f29" },
          code: { type: "string", example: "XsqboTdpHD9Qiv4Q3W3VHQxufUpa2ykm" },
          qr_base64: { type: "string", example: "iVBORw0KGgoAAAANSUhEUgAA..." },
          qr_payload: {
            type: "string",
            example: "https://api.astir-animation.uz/child/pair?code=XsqboTdpHD9Qiv4Q3W3VHQxufUpa2ykm"
          },
          expires_at: { type: "string", format: "date-time" }
        }
      },
      LegacyChildPairingStatus: {
        type: "object",
        properties: {
          device_id: { type: "string", example: "3c52a843-0681-433c-a51e-c2f399dc4f29" },
          status: { type: "string", example: "pending" },
          expires_at: { type: "string", format: "date-time" },
          access_token: { type: "string" },
          refresh_token: { type: "string" },
          refresh_expires_at: { type: "string", format: "date-time" },
          child: {
            nullable: true,
            allOf: [{ $ref: "#/components/schemas/LegacyChild" }]
          }
        }
      },
      LegacyChildDevice: {
        type: "object",
        properties: {
          id: { type: "string", example: "3c52a843-0681-433c-a51e-c2f399dc4f29" },
          child_id: { type: "string", example: "b219a2f6-0670-44ed-8e18-57f887bd4e94" },
          device_fingerprint: { type: "string", example: "string" },
          device_name: { type: "string", example: "string" },
          pairing_expires_at: { type: "string", format: "date-time" },
          paired_at: { type: "string", format: "date-time", nullable: true },
          revoked_at: { type: "string", format: "date-time", nullable: true },
          last_seen_at: { type: "string", format: "date-time", nullable: true },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" }
        }
      },
      LegacyChildPermission: {
        type: "object",
        properties: {
          id: { type: "string" },
          child_id: { type: "string", example: "b219a2f6-0670-44ed-8e18-57f887bd4e94" },
          mode: { type: "string", example: "allow" },
          category_id: { type: "string", nullable: true },
          content_id: { type: "string", nullable: true },
          watch_from_min: { type: "integer", nullable: true, example: 0 },
          watch_until_min: { type: "integer", nullable: true, example: 1320 },
          weekday_mask: { type: "integer", nullable: true, example: 127 },
          daily_limit_minutes: { type: "integer", nullable: true, example: 0 },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" }
        }
      },
      LegacyChildConfirmResult: {
        type: "object",
        properties: {
          action: { type: "string", example: "pairing" },
          device: { $ref: "#/components/schemas/LegacyChildDevice" },
          ticket_id: { type: "string" },
          extends_until: { type: "string", format: "date-time" },
          permissions: {
            type: "array",
            items: { $ref: "#/components/schemas/LegacyChildPermission" }
          }
        }
      },
      Child: {
        type: "object",
        properties: {
          id: { type: "string" },
          parentId: { type: "string" },
          name: { type: "string", example: "Child" },
          birthYear: { type: "integer", example: 2018 },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      WatchLimit: {
        type: "object",
        properties: {
          id: { type: "string" },
          parentId: { type: "string" },
          childId: { type: "string" },
          dailyMinutes: { type: "integer", example: 60 },
          allowedFrom: { type: "string", example: "08:00" },
          allowedTo: { type: "string", example: "20:00" },
          allowedDays: {
            type: "array",
            items: { type: "integer" },
            example: [1, 2, 3, 4, 5, 6, 7]
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      ContentItem: {
        type: "object",
        properties: {
          id: { type: "string", example: "bluey-001" },
          title: { $ref: "#/components/schemas/LocalizedText" },
          type: { type: "string", example: "cartoon" },
          ageRating: { type: "string", example: "G" },
          durationMinutes: { type: "integer", example: 7 }
        }
      },
      ContentCategory: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { $ref: "#/components/schemas/LocalizedText" },
          description: { $ref: "#/components/schemas/LocalizedText" }
        }
      },
      ContentMovie: {
        type: "object",
        properties: {
          id: {
            type: "string",
            format: "uuid",
            readOnly: true,
            example: "7d13c3a7-07d0-4f99-81a1-fb2efc42d1d8"
          },
          title: { $ref: "#/components/schemas/LocalizedText" },
          description: { $ref: "#/components/schemas/LocalizedText" },
          series: {
            type: "array",
            items: {
              oneOf: [
                { type: "string" },
                { $ref: "#/components/schemas/ContentMovie" }
              ]
            }
          },
          is_premium: { type: "boolean", example: false },
          media: {
            type: "object",
            properties: {
              has_source: { type: "boolean", example: true },
              original_name: { type: "string", nullable: true, example: "movie.mp4" },
              mime_type: { type: "string", nullable: true, example: "video/mp4" },
              size: { type: "integer", nullable: true, example: 1024000 }
            }
          },
          playback: {
            type: "object",
            properties: {
              type: { type: "string", example: "hls" },
              status: { type: "string", example: "pending" },
              hls_url: { type: "string", nullable: true, example: "/media/hls/movie_id/master.m3u8" },
              error: { type: "string", nullable: true }
            }
          }
        }
      },
      Tariff: {
        type: "object",
        properties: {
          id: { type: "string", example: "free" },
          code: { type: "string", example: "free" },
          title: { $ref: "#/components/schemas/LocalizedText" },
          description: { $ref: "#/components/schemas/LocalizedText" },
          is_default: { type: "boolean", example: true },
          can_watch_premium: { type: "boolean", example: false },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      TariffStatus: {
        type: "object",
        properties: {
          tariff: { $ref: "#/components/schemas/Tariff" },
          subscription: {
            nullable: true,
            allOf: [{ $ref: "#/components/schemas/Subscription" }]
          },
          access: {
            type: "object",
            properties: {
              can_watch_premium: { type: "boolean", example: false }
            }
          }
        }
      },
      Subscription: {
        type: "object",
        nullable: true,
        properties: {
          id: { type: "string" },
          parentId: { type: "string" },
          tariffId: { type: "string", example: "premium" },
          provider: { type: "string", enum: ["apple", "google"], example: "apple" },
          providerSubscriptionId: { type: "string", example: "1000001234567890" },
          status: {
            type: "string",
            enum: ["active", "grace_period", "expired", "cancelled"],
            example: "active"
          },
          startedAt: { type: "string", format: "date-time" },
          expiresAt: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      BillingPurchaseResponse: {
        type: "object",
        properties: {
          subscription: { $ref: "#/components/schemas/Subscription" },
          tariff: { $ref: "#/components/schemas/Tariff" },
          access: {
            type: "object",
            properties: {
              can_watch_premium: { type: "boolean", example: true }
            }
          }
        }
      }
    }
  },
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Check server status",
        responses: {
          200: {
            description: "Server is running",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a parent account",
        description: "Legacy PostgreSQL API endpoint. Creates a parent account after OTP verification and returns an access/refresh token pair.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "name", "password"],
                properties: {
                  email: {
                    type: "string",
                    example: "m86688628@gmail.com"
                  },
                  last_name: {
                    type: "string",
                    example: "asdasd"
                  },
                  name: {
                    type: "string",
                    example: "Alisher"
                  },
                  password: {
                    type: "string",
                    example: "wi3eZ2L*A+,7&L2FH3fM"
                  }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyTokenPair" }
              }
            }
          },
          400: {
            description: "Bad Request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          401: {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          409: {
            description: "Conflict",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/v1/auth/google": {
      post: {
        tags: ["Auth"],
        summary: "Sign in with Google",
        description: "Legacy PostgreSQL API endpoint. Accepts a Google ID token, verifies it with Google, finds or creates a parent user, and returns a legacy token pair.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["id_token"],
                properties: {
                  id_token: {
                    type: "string",
                    example: "eyJhbGci..."
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "Parent signed in",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyTokenPair" }
              }
            }
          },
          400: {
            description: "Bad Request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          401: {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          503: {
            description: "Service unavailable",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/v1/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Log in",
        description: "Legacy PostgreSQL API endpoint. Logs in staff users and returns an access/refresh token pair.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: {
                    type: "string",
                    example: "admin@example.com"
                  },
                  password: {
                    type: "string",
                    example: "string"
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyTokenPair" }
              }
            }
          },
          401: {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/v1/auth/otp/login": {
      post: {
        tags: ["Auth"],
        summary: "Parent login",
        description: "Legacy PostgreSQL API endpoint. Logs in a parent with email and password and returns an access/refresh token pair.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: {
                    type: "string",
                    example: "botirjonz777zz@gmail.com"
                  },
                  password: {
                    type: "string",
                    example: "Muhammadamin88"
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyTokenPair" }
              }
            }
          },
          401: {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/v1/auth/apple": {
      post: {
        tags: ["Auth"],
        summary: "Sign in with Apple",
        description: "Legacy PostgreSQL API endpoint. Accepts an Apple identity token, verifies it with Apple, finds or creates a parent user, and returns a legacy token pair.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                oneOf: [
                  { required: ["identity_token"] },
                  { required: ["id_token"] }
                ],
                properties: {
                  identity_token: {
                    type: "string",
                    example: "eyJhbGci..."
                  },
                  id_token: {
                    type: "string",
                    example: "eyJhbGci..."
                  },
                  given_name: {
                    type: "string",
                    example: "Alisher"
                  },
                  family_name: {
                    type: "string",
                    example: "Karimov"
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "Parent signed in",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyTokenPair" }
              }
            }
          },
          400: {
            description: "Bad Request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          401: {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          503: {
            description: "Service unavailable",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/v1/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Log out",
        description: "Legacy PostgreSQL API endpoint. Revokes the refresh token when one is provided and returns ok.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["refresh_token"],
                properties: {
                  refresh_token: {
                    type: "string",
                    example: "string"
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyOkResponse" }
              }
            }
          }
        }
      }
    },
    "/api/v1/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Refresh an access token",
        description: "Legacy PostgreSQL API endpoint. Exchanges a valid refresh token for a new access/refresh token pair.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["refresh_token"],
                properties: {
                  refresh_token: {
                    type: "string",
                    example: "string"
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyTokenPair" }
              }
            }
          },
          401: {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/v1/auth/otp/request": {
      post: {
        tags: ["Auth"],
        summary: "Request OTP",
        description: "Legacy PostgreSQL API endpoint. Sends an OTP code to the provided email address.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email"],
                properties: {
                  email: {
                    type: "string",
                    example: "user@example.com"
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyOtpRequestResult" }
              }
            }
          },
          400: {
            description: "Bad Request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/v1/auth/otp/verify": {
      post: {
        tags: ["Auth"],
        summary: "Verify OTP",
        description: "Legacy PostgreSQL API endpoint. Verifies an OTP code and returns token fields when a user already exists.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "code"],
                properties: {
                  email: {
                    type: "string",
                    example: "user@example.com"
                  },
                  code: {
                    type: "string",
                    example: "123456"
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyOtpVerifyResult" }
              }
            }
          },
          401: {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/v1/auth/forgot-password": {
      post: {
        tags: ["Auth"],
        summary: "Start password reset",
        description: "Legacy PostgreSQL API endpoint. Sends an OTP to an existing user's email for password reset.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email"],
                properties: {
                  email: {
                    type: "string",
                    example: "user@example.com"
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyOtpRequestResult" }
              }
            }
          },
          400: {
            description: "Bad Request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          404: {
            description: "Not Found",
            content: {
              "application/json": {
                schema: {
                  allOf: [{ $ref: "#/components/schemas/LegacyErrorResponse" }],
                  example: {
                    error: "not found",
                    message: {
                      uz: "So'ralgan ma'lumot topilmadi.",
                      ru: "Запрашиваемые данные не найдены.",
                      en: "The requested resource was not found."
                    }
                  }
                }
              }
            }
          },
          503: {
            description: "Service unavailable",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/v1/auth/reset-password": {
      post: {
        tags: ["Auth"],
        summary: "Reset password",
        description: "Legacy PostgreSQL API endpoint. Sets a new password after the email has a verified reset-password OTP.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: {
                    type: "string",
                    example: "user@example.com"
                  },
                  password: {
                    type: "string",
                    example: "string"
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyOkResponse" }
              }
            }
          },
          400: {
            description: "Bad Request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          401: {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/v1/auth/me/avatar": {
      post: {
        tags: ["Auth"],
        summary: "Upload profile avatar",
        description: "Legacy PostgreSQL API endpoint. Uploads a profile avatar image for the current authenticated user.",
        security: [{ legacyBearer: [] }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: {
                  file: {
                    type: "string",
                    format: "binary",
                    description: "Avatar image (jpg/png/webp)."
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyUser" }
              }
            }
          },
          400: {
            description: "Bad Request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          401: {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/v1/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get current legacy user",
        description: "Legacy PostgreSQL API endpoint. Returns the current user including avatar_url. Use this instead of downloading /api/v1/users/{id}/avatar.",
        security: [{ legacyBearer: [] }],
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyUser" }
              }
            }
          },
          401: {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      },
      put: {
        tags: ["Auth"],
        summary: "Update current legacy user",
        description: "Legacy PostgreSQL API endpoint. Updates the current user's profile fields.",
        security: [{ legacyBearer: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  last_name: {
                    type: "string",
                    example: "string"
                  },
                  name: {
                    type: "string",
                    example: "string"
                  },
                  phone: {
                    type: "string",
                    example: "+998901234567"
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyUser" }
              }
            }
          },
          401: {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/v1/auth/child/init": {
      post: {
        tags: ["Auth"],
        summary: "Initialize child device pairing",
        description: "Legacy PostgreSQL API endpoint. The child app calls this first and shows the returned QR. The parent scans the QR and confirms the device with POST /api/v1/auth/child/confirm.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["device_fingerprint", "device_name"],
                properties: {
                  device_fingerprint: {
                    type: "string",
                    example: "string"
                  },
                  device_name: {
                    type: "string",
                    example: "string"
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyPairingTicket" }
              }
            }
          },
          500: {
            description: "Internal Server Error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/v1/auth/child/{device_id}/status": {
      get: {
        tags: ["Auth"],
        summary: "Check child pairing status",
        description: "Legacy PostgreSQL API endpoint. The child app polls this endpoint until the parent confirms the pairing.",
        parameters: [
          {
            name: "device_id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Device ID returned by /api/v1/auth/child/init."
          }
        ],
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyChildPairingStatus" }
              }
            }
          },
          400: {
            description: "Bad Request",
            content: {
              "application/json": {
                schema: {
                  allOf: [{ $ref: "#/components/schemas/LegacyErrorResponse" }],
                  example: {
                    error: "invalid device_id",
                    message: {
                      uz: "Identifikator formati noto'g'ri.",
                      ru: "Неверный формат идентификатора.",
                      en: "The identifier format is invalid."
                    }
                  }
                }
              }
            }
          },
          404: {
            description: "Not Found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/v1/auth/child/confirm": {
      post: {
        tags: ["Auth"],
        summary: "Confirm child device pairing",
        description: "Legacy PostgreSQL API endpoint. Parent scans the child QR and links the pending device to an existing child profile.",
        security: [{ legacyBearer: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["code"],
                properties: {
                  code: {
                    type: "string",
                    example: "XsqboTdpHD9Qiv4Q3W3VHQxufUpa2ykm"
                  },
                  child_id: {
                    type: "string",
                    example: "b219a2f6-0670-44ed-8e18-57f887bd4e94"
                  },
                  permissions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        category_id: { type: "string", example: "string" },
                        content_id: { type: "string", example: "string" },
                        daily_limit_minutes: { type: "integer", example: 0 },
                        mode: { type: "string", example: "allow" },
                        watch_from_min: { type: "integer", example: 0 },
                        watch_until_min: { type: "integer", example: 1320 },
                        weekday_mask: { type: "integer", example: 127 }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyChildConfirmResult" }
              }
            }
          },
          400: {
            description: "Bad Request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          401: {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          404: {
            description: "Not Found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          410: {
            description: "Gone",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/v1/children": {
      get: {
        tags: ["Children"],
        summary: "List legacy child profiles",
        description: "Legacy PostgreSQL API endpoint. Lists child profiles for the authenticated parent.",
        security: [{ legacyBearer: [] }],
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/LegacyChild" }
                }
              }
            }
          },
          401: {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      },
      post: {
        tags: ["Children"],
        summary: "Create a legacy child profile",
        description: "Legacy PostgreSQL API endpoint. Creates a child profile that can later be paired to a child device.",
        security: [{ legacyBearer: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: {
                    type: "string",
                    example: "Child"
                  },
                  age: {
                    type: "integer",
                    example: 7
                  },
                  avatar_url: {
                    type: "string",
                    example: ""
                  },
                  active: {
                    type: "boolean",
                    example: true
                  }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyChild" }
              }
            }
          },
          400: {
            description: "Bad Request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          401: {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/v1/children/{id}": {
      put: {
        tags: ["Children"],
        summary: "Update a legacy child profile",
        description: "Legacy PostgreSQL API endpoint. Updates a child profile for the authenticated parent.",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Child ID.",
            schema: { type: "string" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  active: {
                    type: "boolean",
                    example: true
                  },
                  age: {
                    type: "integer",
                    example: 0
                  },
                  avatar_url: {
                    type: "string",
                    example: "string"
                  },
                  name: {
                    type: "string",
                    example: "string"
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyChild" }
              }
            }
          },
          400: {
            description: "Bad Request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          401: {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          404: {
            description: "Not Found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      },
      delete: {
        tags: ["Children"],
        summary: "Delete a legacy child profile",
        description: "Legacy PostgreSQL API endpoint. Deletes a child profile for the authenticated parent.",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Child ID.",
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyOkResponse" }
              }
            }
          },
          400: {
            description: "Bad Request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          401: {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          404: {
            description: "Not Found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/v1/children/{id}/devices": {
      get: {
        tags: ["Children"],
        summary: "List paired child devices",
        description: "Legacy PostgreSQL API endpoint. Lists paired devices for a child profile owned by the authenticated parent.",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Child ID.",
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/LegacyChildDevice" }
                }
              }
            }
          },
          400: {
            description: "Bad Request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          401: {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          404: {
            description: "Not Found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/v1/children/{id}/devices/{device_id}": {
      delete: {
        tags: ["Children"],
        summary: "Revoke a paired child device",
        description: "Legacy PostgreSQL API endpoint. Revokes a paired child device for a child profile owned by the authenticated parent.",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Child ID.",
            schema: { type: "string" }
          },
          {
            name: "device_id",
            in: "path",
            required: true,
            description: "Device ID.",
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyOkResponse" }
              }
            }
          },
          400: {
            description: "Bad Request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          401: {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          404: {
            description: "Not Found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/v1/children/{id}/extend/init": {
      post: {
        tags: ["Children"],
        summary: "Initialize child watch extension",
        description: "Legacy PostgreSQL API endpoint. Creates a QR ticket for extending a child's watch time.",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Child ID.",
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ticket_id: { type: "string" },
                    expires_at: { type: "string", format: "date-time" },
                    qr_payload: { type: "string" },
                    qr_base64: { type: "string" }
                  }
                }
              }
            }
          },
          400: {
            description: "Bad Request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          401: {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          404: {
            description: "Not Found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/v1/children/{id}/extend/pin": {
      post: {
        tags: ["Children"],
        summary: "Extend child watch time by PIN",
        description: "Legacy PostgreSQL API endpoint. Extends a child's watch time when a valid child PIN is provided.",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Child ID.",
            schema: { type: "string" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["pin"],
                properties: {
                  pin: {
                    type: "string",
                    example: "1234"
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyOkResponse" }
              }
            }
          },
          400: {
            description: "Bad Request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          401: {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          404: {
            description: "Not Found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/v1/children/{id}/extend/{ticket_id}/status": {
      get: {
        tags: ["Children"],
        summary: "Get child watch extension status",
        description: "Legacy PostgreSQL API endpoint. Returns the status for a child watch-extension ticket.",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Child ID.",
            schema: { type: "string" }
          },
          {
            name: "ticket_id",
            in: "path",
            required: true,
            description: "Ticket ID.",
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ticket_id: { type: "string" },
                    status: { type: "string" },
                    extends_until: { type: "string", format: "date-time" }
                  }
                }
              }
            }
          },
          400: {
            description: "Bad Request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          401: {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          404: {
            description: "Not Found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/v1/children/{id}/permissions": {
      get: {
        tags: ["Children"],
        summary: "List child permissions",
        description: "Legacy PostgreSQL API endpoint. Lists allow/deny permission rules for a child profile owned by the authenticated parent.",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Child ID.",
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/LegacyChildPermission" }
                }
              }
            }
          },
          400: {
            description: "Bad Request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          401: {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          404: {
            description: "Not Found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      },
      post: {
        tags: ["Children"],
        summary: "Create a child permission",
        description: "Legacy PostgreSQL API endpoint. Attaches an allow/deny permission rule to a child profile owned by the authenticated parent.",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Child ID.",
            schema: { type: "string" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  category_id: { type: "string", example: "string" },
                  content_id: { type: "string", example: "string" },
                  daily_limit_minutes: { type: "integer", example: 0 },
                  mode: { type: "string", example: "allow" },
                  watch_from_min: { type: "integer", example: 0 },
                  watch_until_min: { type: "integer", example: 1320 },
                  weekday_mask: { type: "integer", example: 127 }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyChildPermission" }
              }
            }
          },
          400: {
            description: "Bad Request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          401: {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          404: {
            description: "Not Found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/v1/children/{id}/permissions/{rule_id}": {
      put: {
        tags: ["Children"],
        summary: "Update a child permission",
        description: "Legacy PostgreSQL API endpoint. Updates an allow/deny permission rule for a child profile owned by the authenticated parent.",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Child ID.",
            schema: { type: "string" }
          },
          {
            name: "rule_id",
            in: "path",
            required: true,
            description: "Permission rule ID.",
            schema: { type: "string" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  category_id: { type: "string", example: "string" },
                  content_id: { type: "string", example: "string" },
                  daily_limit_minutes: { type: "integer", example: 0 },
                  mode: { type: "string", example: "allow" },
                  watch_from_min: { type: "integer", example: 0 },
                  watch_until_min: { type: "integer", example: 1320 },
                  weekday_mask: { type: "integer", example: 127 }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyChildPermission" }
              }
            }
          },
          400: {
            description: "Bad Request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          401: {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          404: {
            description: "Not Found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/v1/pairing/sessions": {
      post: {
        tags: ["Pairing"],
        summary: "Create a pairing session",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["deviceName", "platform"],
                properties: {
                  deviceName: { type: "string", example: "Living Room TV" },
                  platform: { type: "string", example: "tv" }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: "Pairing session created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    pairingSession: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        code: { type: "string", example: "123456" },
                        setupToken: { type: "string" },
                        status: { type: "string", example: "pending" },
                        expiresAt: { type: "string", format: "date-time" },
                        qrPayload: { type: "object" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/v1/pairing/sessions/{sessionId}": {
      get: {
        tags: ["Pairing"],
        summary: "Check pairing status",
        parameters: [
          {
            name: "sessionId",
            in: "path",
            required: true,
            schema: { type: "string" }
          },
          {
            name: "x-setup-token",
            in: "header",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "Pairing status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    pairingSession: { type: "object" }
                  }
                }
              }
            }
          },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/v1/pairing/sessions/{sessionId}/approve": {
      post: {
        tags: ["Pairing"],
        summary: "Approve pairing",
        security: [{ parentToken: [] }],
        parameters: [
          {
            name: "sessionId",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["childId"],
                properties: {
                  childId: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "Pairing approved",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    pairingSession: { type: "object" }
                  }
                }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/v1/device/config": {
      get: {
        tags: ["Device"],
        summary: "Get paired device config",
        security: [{ deviceToken: [] }],
        responses: {
          200: {
            description: "Device config",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    device: { type: "object" },
                    child: { $ref: "#/components/schemas/Child" },
                    limit: { $ref: "#/components/schemas/WatchLimit" }
                  }
                }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" }
        }
      }
    },
    "/v1/billing/subscription/current": {
      get: {
        tags: ["Billing"],
        summary: "Get current active subscription",
        security: [{ parentToken: [] }, { deviceToken: [] }],
        responses: {
          200: {
            description: "Current subscription",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    subscription: {
                      nullable: true,
                      allOf: [{ $ref: "#/components/schemas/Subscription" }]
                    }
                  }
                }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" }
        }
      }
    },
    "/v1/billing/apple/verify": {
      post: {
        tags: ["Billing"],
        summary: "Verify Apple purchase",
        security: [{ parentToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["tariff_id", "receipt", "provider_subscription_id"],
                properties: {
                  tariff_id: { type: "string", example: "premium" },
                  receipt: { type: "string", example: "apple-receipt-data" },
                  provider_subscription_id: { type: "string", example: "1000001234567890" },
                  original_transaction_id: { type: "string", example: "1000001234567890" },
                  transaction_id: { type: "string", example: "1000001234567891" },
                  expires_at: { type: "string", format: "date-time" }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: "Purchase verified",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/BillingPurchaseResponse" }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/v1/billing/google/verify": {
      post: {
        tags: ["Billing"],
        summary: "Verify Google Play purchase",
        security: [{ parentToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["tariff_id", "purchase_token"],
                properties: {
                  tariff_id: { type: "string", example: "premium" },
                  purchase_token: { type: "string", example: "google-purchase-token" },
                  product_id: { type: "string", example: "astir_premium_monthly" },
                  provider_subscription_id: { type: "string", example: "google-subscription-id" },
                  expires_at: { type: "string", format: "date-time" }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: "Purchase verified",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/BillingPurchaseResponse" }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/v1/billing/webhook/apple": {
      post: {
        tags: ["Billing"],
        summary: "Handle Apple subscription webhook",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  subscription_id: { type: "string" },
                  provider_subscription_id: { type: "string", example: "1000001234567890" },
                  status: {
                    type: "string",
                    enum: ["active", "grace_period", "expired", "cancelled"],
                    example: "expired"
                  },
                  expires_at: { type: "string", format: "date-time" }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "Webhook accepted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    accepted: { type: "boolean", example: true },
                    subscription: {
                      nullable: true,
                      allOf: [{ $ref: "#/components/schemas/Subscription" }]
                    }
                  }
                }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" }
        }
      }
    },
    "/v1/billing/webhook/google": {
      post: {
        tags: ["Billing"],
        summary: "Handle Google Play subscription webhook",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  subscription_id: { type: "string" },
                  provider_subscription_id: { type: "string", example: "google-subscription-id" },
                  purchase_token: { type: "string", example: "google-purchase-token" },
                  status: {
                    type: "string",
                    enum: ["active", "grace_period", "expired", "cancelled"],
                    example: "cancelled"
                  },
                  expires_at: { type: "string", format: "date-time" }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "Webhook accepted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    accepted: { type: "boolean", example: true },
                    subscription: {
                      nullable: true,
                      allOf: [{ $ref: "#/components/schemas/Subscription" }]
                    }
                  }
                }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" }
        }
      }
    },
    "/v1/tariffs": {
      get: {
        tags: ["Tariffs"],
        summary: "List tariffs",
        responses: {
          200: {
            description: "Tariff list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    tariffs: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Tariff" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/v1/tariffs/{tariff_id}": {
      get: {
        tags: ["Tariffs"],
        summary: "Get one tariff",
        parameters: [
          {
            name: "tariff_id",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "Tariff details",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    tariff: { $ref: "#/components/schemas/Tariff" }
                  }
                }
              }
            }
          },
          404: { $ref: "#/components/responses/NotFound" }
        }
      },
      patch: {
        tags: ["Tariffs"],
        summary: "Update one tariff",
        security: [{ parentToken: [] }],
        parameters: [
          {
            name: "tariff_id",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: { $ref: "#/components/schemas/LocalizedText" },
                  description: { $ref: "#/components/schemas/LocalizedText" },
                  is_default: { type: "boolean", example: false },
                  can_watch_premium: { type: "boolean", example: true }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "Tariff updated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    tariff: { $ref: "#/components/schemas/Tariff" }
                  }
                }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      },
      delete: {
        tags: ["Tariffs"],
        summary: "Delete one tariff",
        security: [{ parentToken: [] }],
        parameters: [
          {
            name: "tariff_id",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "Tariff deleted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    deleted: { type: "boolean", example: true },
                    tariff: { $ref: "#/components/schemas/Tariff" }
                  }
                }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
          409: { $ref: "#/components/responses/Conflict" }
        }
      }
    },
    "/v1/tariffs/create": {
      post: {
        tags: ["Tariffs"],
        summary: "Create a tariff",
        security: [{ parentToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title", "description"],
                properties: {
                  id: { type: "string", example: "family" },
                  title: { $ref: "#/components/schemas/LocalizedText" },
                  description: { $ref: "#/components/schemas/LocalizedText" },
                  is_default: { type: "boolean", example: false },
                  can_watch_premium: { type: "boolean", example: true }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: "Tariff created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    tariff: { $ref: "#/components/schemas/Tariff" }
                  }
                }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          409: { $ref: "#/components/responses/Conflict" }
        }
      }
    },
    "/v1/tariffs/current": {
      get: {
        tags: ["Tariffs"],
        summary: "Get current account tariff",
        security: [{ parentToken: [] }, { deviceToken: [] }],
        responses: {
          200: {
            description: "Current tariff",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TariffStatus" }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" }
        }
      },
      patch: {
        tags: ["Tariffs"],
        summary: "Change current parent tariff",
        security: [{ parentToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["tariff"],
                properties: {
                  tariff: { type: "string", example: "premium" }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "Tariff updated",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TariffStatus" }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" }
        }
      }
    },
    "/v1/content/movies": {
      get: {
        tags: ["Movies"],
        summary: "List movies",
        security: [{ parentToken: [] }, { deviceToken: [] }],
        responses: {
          200: {
            description: "Movie list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    movies: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ContentMovie" }
                    }
                  }
                }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" }
        }
      }
    },
    "/v1/content/movies/{movie_id}": {
      get: {
        tags: ["Movies"],
        summary: "Get one movie and prepare playback",
        security: [{ parentToken: [] }, { deviceToken: [] }],
        parameters: [
          {
            name: "movie_id",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "Movie details",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    movie: { $ref: "#/components/schemas/ContentMovie" }
                  }
                }
              }
            }
          },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      },
      patch: {
        tags: ["Movies"],
        summary: "Update movie title or description",
        security: [{ parentToken: [] }],
        parameters: [
          {
            name: "movie_id",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: { $ref: "#/components/schemas/LocalizedText" },
                  description: { $ref: "#/components/schemas/LocalizedText" }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "Movie updated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    movie: { $ref: "#/components/schemas/ContentMovie" }
                  }
                }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      },
      delete: {
        tags: ["Movies"],
        summary: "Delete one movie",
        security: [{ parentToken: [] }],
        parameters: [
          {
            name: "movie_id",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "Movie deleted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    deleted: { type: "boolean", example: true },
                    movie: { $ref: "#/components/schemas/ContentMovie" }
                  }
                }
              }
            }
          },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/v1/content/movies/{movie_id}/series": {
      get: {
        tags: ["Movies"],
        summary: "List movie series",
        security: [{ parentToken: [] }, { deviceToken: [] }],
        parameters: [
          {
            name: "movie_id",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "Movie series list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    movie_id: { type: "string" },
                    series: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ContentMovie" }
                    }
                  }
                }
              }
            }
          },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      },
      post: {
        tags: ["Movies"],
        summary: "Add movie to series",
        security: [{ parentToken: [] }],
        parameters: [
          {
            name: "movie_id",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title", "description"],
                properties: {
                  title: { $ref: "#/components/schemas/LocalizedText" },
                  description: { $ref: "#/components/schemas/LocalizedText" },
                  is_premium: { type: "boolean", example: false }
                }
              }
            },
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["metadata"],
                properties: {
                  metadata: {
                    type: "string",
                    description: "JSON with title, description, and is_premium"
                  },
                  video: {
                    type: "string",
                    format: "binary"
                  }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: "Series movie added",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    movie: { $ref: "#/components/schemas/ContentMovie" },
                    series_item: { $ref: "#/components/schemas/ContentMovie" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/v1/content/movies/create": {
      post: {
        tags: ["Movies"],
        summary: "Create or upload a movie",
        security: [{ parentToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title", "description"],
                properties: {
                  title: { $ref: "#/components/schemas/LocalizedText" },
                  description: { $ref: "#/components/schemas/LocalizedText" },
                  series: {
                    type: "array",
                    items: { type: "string" }
                  },
                  is_premium: { type: "boolean", example: false }
                }
              }
            },
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["metadata"],
                properties: {
                  metadata: {
                    type: "string",
                    description: "JSON with title, description, series, and is_premium"
                  },
                  video: {
                    type: "string",
                    format: "binary"
                  }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: "Movie created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    movie: { $ref: "#/components/schemas/ContentMovie" }
                  }
                }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" }
        }
      }
    },
    "/v1/content/categories": {
      get: {
        tags: ["Categories"],
        summary: "List content categories",
        security: [{ parentToken: [] }, { deviceToken: [] }],
        responses: {
          200: {
            description: "Content category list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    categories: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ContentCategory" }
                    }
                  }
                }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" }
        }
      }
    },
    "/v1/content/categories/{category_id}": {
      get: {
        tags: ["Categories"],
        summary: "Get one content category",
        security: [{ parentToken: [] }, { deviceToken: [] }],
        parameters: [
          {
            name: "category_id",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "Content category",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    category: { $ref: "#/components/schemas/ContentCategory" }
                  }
                }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      },
      patch: {
        tags: ["Categories"],
        summary: "Update one content category",
        security: [{ parentToken: [] }],
        parameters: [
          {
            name: "category_id",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: { $ref: "#/components/schemas/LocalizedText" },
                  description: { $ref: "#/components/schemas/LocalizedText" }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "Content category updated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    category: { $ref: "#/components/schemas/ContentCategory" }
                  }
                }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
          409: { $ref: "#/components/responses/Conflict" }
        }
      },
      delete: {
        tags: ["Categories"],
        summary: "Delete one content category",
        security: [{ parentToken: [] }],
        parameters: [
          {
            name: "category_id",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "Content category deleted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    deleted: { type: "boolean", example: true },
                    category: { $ref: "#/components/schemas/ContentCategory" }
                  }
                }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/v1/content/categories/create": {
      post: {
        tags: ["Categories"],
        summary: "Create a content category",
        security: [{ parentToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title", "description"],
                properties: {
                  title: { $ref: "#/components/schemas/LocalizedText" },
                  description: { $ref: "#/components/schemas/LocalizedText" }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: "Content category created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    category: { $ref: "#/components/schemas/ContentCategory" }
                  }
                }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          409: { $ref: "#/components/responses/Conflict" }
        }
      }
    },
    "/v1/watch-sessions/start": {
      post: {
        tags: ["Watch Sessions"],
        summary: "Start a watch session",
        security: [{ deviceToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["contentId"],
                properties: {
                  contentId: { type: "string", example: "bluey-001" }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: "Watch session started",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    watchSession: { type: "object" }
                  }
                }
              }
            }
          },
          403: { $ref: "#/components/responses/Forbidden" }
        }
      }
    },
    "/v1/watch-sessions/{watchSessionId}/stop": {
      patch: {
        tags: ["Watch Sessions"],
        summary: "Stop a watch session",
        security: [{ deviceToken: [] }],
        parameters: [
          {
            name: "watchSessionId",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "Watch session stopped",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    watchSession: { type: "object" }
                  }
                }
              }
            }
          },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    }
  }
};

openApiDocument.components.responses = {
  BadRequest: {
    description: "Bad request",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ErrorResponse" }
      }
    }
  },
  Unauthorized: {
    description: "Unauthorized",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ErrorResponse" }
      }
    }
  },
  Forbidden: {
    description: "Forbidden",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ErrorResponse" }
      }
    }
  },
  NotFound: {
    description: "Not found",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ErrorResponse" }
      }
    }
  },
  Conflict: {
    description: "Conflict",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ErrorResponse" }
      }
    }
  },
  ServiceUnavailable: {
    description: "Service unavailable",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ErrorResponse" }
      }
    }
  }
};

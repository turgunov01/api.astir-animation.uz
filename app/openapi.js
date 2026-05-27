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
    { name: "Content" },
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
              message: { type: "string", example: "Email is required" }
            }
          }
        }
      },
      Parent: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string", example: "Parent" },
          email: { type: "string", example: "parent@example.com" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
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
          title: { type: "string", example: "Bluey - Keepy Uppy" },
          type: { type: "string", example: "cartoon" },
          ageRating: { type: "string", example: "G" },
          durationMinutes: { type: "integer", example: 7 }
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
    "/v1/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a parent",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "email", "password", "pin"],
                properties: {
                  name: { type: "string", example: "Parent" },
                  email: { type: "string", example: "parent@example.com" },
                  password: { type: "string", example: "password123" },
                  pin: { type: "string", example: "1234" }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: "Parent created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    parent: { $ref: "#/components/schemas/Parent" },
                    token: { type: "string" }
                  }
                }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          409: { $ref: "#/components/responses/Conflict" }
        }
      }
    },
    "/v1/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login as parent",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", example: "parent@example.com" },
                  password: { type: "string", example: "password123" }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "Parent logged in",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    parent: { $ref: "#/components/schemas/Parent" },
                    token: { type: "string" }
                  }
                }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" }
        }
      }
    },
    "/v1/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get current parent",
        security: [{ parentToken: [] }],
        responses: {
          200: {
            description: "Current parent",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    parent: { $ref: "#/components/schemas/Parent" }
                  }
                }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" }
        }
      }
    },
    "/v1/auth/pin/verify": {
      post: {
        tags: ["Auth"],
        summary: "Verify parent PIN",
        security: [{ parentToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["pin"],
                properties: {
                  pin: { type: "string", example: "1234" }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "PIN verified",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    verified: { type: "boolean", example: true }
                  }
                }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" }
        }
      }
    },
    "/v1/children": {
      get: {
        tags: ["Children"],
        summary: "List children",
        security: [{ parentToken: [] }],
        responses: {
          200: {
            description: "Children list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    children: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Child" }
                    }
                  }
                }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" }
        }
      },
      post: {
        tags: ["Children"],
        summary: "Create a child",
        security: [{ parentToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "birthYear"],
                properties: {
                  name: { type: "string", example: "Child" },
                  birthYear: { type: "integer", example: 2018 }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: "Child created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    child: { $ref: "#/components/schemas/Child" }
                  }
                }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" }
        }
      }
    },
    "/v1/children/{childId}": {
      get: {
        tags: ["Children"],
        summary: "Get one child",
        security: [{ parentToken: [] }],
        parameters: [
          {
            name: "childId",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "Child",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    child: { $ref: "#/components/schemas/Child" }
                  }
                }
              }
            }
          },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/v1/children/{childId}/limits": {
      get: {
        tags: ["Children"],
        summary: "Get child limits",
        security: [{ parentToken: [] }],
        parameters: [
          {
            name: "childId",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "Child limits",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    limit: { $ref: "#/components/schemas/WatchLimit" }
                  }
                }
              }
            }
          },
          404: { $ref: "#/components/responses/NotFound" }
        }
      },
      put: {
        tags: ["Children"],
        summary: "Update child limits",
        security: [{ parentToken: [] }],
        parameters: [
          {
            name: "childId",
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
                required: ["dailyMinutes", "allowedFrom", "allowedTo", "allowedDays"],
                properties: {
                  dailyMinutes: { type: "integer", example: 60 },
                  allowedFrom: { type: "string", example: "08:00" },
                  allowedTo: { type: "string", example: "20:00" },
                  allowedDays: {
                    type: "array",
                    items: { type: "integer" },
                    example: [1, 2, 3, 4, 5, 6, 7]
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "Limits updated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    limit: { $ref: "#/components/schemas/WatchLimit" }
                  }
                }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" }
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
    "/v1/content": {
      get: {
        tags: ["Content"],
        summary: "List fake content",
        security: [{ parentToken: [] }, { deviceToken: [] }],
        responses: {
          200: {
            description: "Content list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    content: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ContentItem" }
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
  }
};

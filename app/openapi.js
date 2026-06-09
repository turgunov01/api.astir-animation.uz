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
    { name: "TV" },
    { name: "Admin" },
    { name: "Users" },
    { name: "Support" },
    { name: "FAQ" },
    { name: "Billing" },
    { name: "Cards" },
    { name: "Series" },
    { name: "Device" },
    { name: "Tariffs" },
    { name: "Movies" },
    { name: "Categories" },
    { name: "Tags" },
    { name: "Likes" },
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
      LegacyTVChildProfile: {
        type: "object",
        properties: {
          active: { type: "boolean" },
          age: { type: "integer" },
          avatar_url: { type: "string" },
          id: { type: "string" },
          name: { type: "string" }
        }
      },
      LegacyTVParentProfile: {
        type: "object",
        properties: {
          avatar_url: { type: "string" },
          id: { type: "string" },
          last_name: { type: "string" },
          name: { type: "string" }
        }
      },
      LegacyTVProfileList: {
        type: "object",
        properties: {
          children: {
            type: "array",
            items: { $ref: "#/components/schemas/LegacyTVChildProfile" }
          },
          parent: { $ref: "#/components/schemas/LegacyTVParentProfile" }
        }
      },
      LegacyTVStatusResult: {
        type: "object",
        properties: {
          device_token: { type: "string" },
          profiles: { $ref: "#/components/schemas/LegacyTVProfileList" },
          status: { type: "string", example: "pending" },
          token_expires_at: { type: "string" }
        }
      },
      LegacyTVStreamSession: {
        type: "object",
        properties: {
          access_token: { type: "string" },
          expires_at: { type: "string", format: "date-time" },
          profile: {},
          profile_type: {
            type: "string",
            example: "parent"
          },
          profiles: { $ref: "#/components/schemas/LegacyTVProfileList" }
        }
      },
      LegacyTVDevice: {
        type: "object",
        properties: {
          confirmed_at: { type: "string", format: "date-time" },
          created_at: { type: "string", format: "date-time" },
          device_fingerprint: { type: "string" },
          device_name: { type: "string" },
          id: { type: "string" },
          last_seen_at: { type: "string", format: "date-time" },
          pairing_expires_at: { type: "string", format: "date-time" },
          parent_id: { type: "string" },
          revoked_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" }
        }
      },
      LegacyAdminCardView: {
        type: "object",
        properties: {
          brand: { type: "string" },
          created_at: { type: "string", format: "date-time" },
          expiry_month: { type: "integer" },
          expiry_year: { type: "integer" },
          holder_name: { type: "string" },
          id: { type: "string" },
          is_default: { type: "boolean" },
          masked_pan: { type: "string" },
          provider: {
            type: "string",
            enum: ["click", "payme", "stripe", "manual"]
          },
          token_hash: { type: "string" },
          user_id: { type: "string" },
          verified_at: { type: "string", format: "date-time" }
        }
      },
      LegacyAdminCardListResponse: {
        type: "object",
        properties: {
          data: {
            type: "array",
            items: { $ref: "#/components/schemas/LegacyAdminCardView" }
          },
          limit: { type: "integer" },
          offset: { type: "integer" },
          total: { type: "integer" }
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
      ChildContentBlacklistItem: {
        type: "object",
        properties: {
          id: { type: "string" },
          parentId: { type: "string" },
          childId: { type: "string" },
          contentId: { type: "string", example: "7d13c3a7-07d0-4f99-81a1-fb2efc42d1d8" },
          content_id: { type: "string", example: "7d13c3a7-07d0-4f99-81a1-fb2efc42d1d8" },
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
          durationMinutes: { type: "integer", example: 7 },
          item_type: { type: "string", example: "content" },
          target_type: { type: "string", example: "content" },
          target_id: { type: "string", example: "bluey-001" },
          likes_count: { type: "integer", example: 1 },
          is_liked: { type: "boolean", example: true }
        }
      },
      ContentCategory: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { $ref: "#/components/schemas/LocalizedText" },
          description: { $ref: "#/components/schemas/LocalizedText" },
          type: { type: "string", example: "cartoon" },
          slug: { type: "string", example: "cartoons" },
          active: { type: "boolean", example: true },
          icon_url: {
            type: "string",
            nullable: true,
            example: "/media/uploads/category-icon.png"
          },
          icon: {
            type: "object",
            nullable: true,
            properties: {
              url: {
                type: "string",
                nullable: true,
                example: "/media/uploads/category-icon.png"
              },
              storage_path: {
                type: "string",
                nullable: true,
                example: "/absolute/storage/path/category-icon.png"
              },
              original_name: {
                type: "string",
                nullable: true,
                example: "category-icon.png"
              },
              mime_type: {
                type: "string",
                nullable: true,
                example: "image/png"
              },
              size: {
                type: "integer",
                nullable: true,
                example: 2048
              }
            }
          }
        }
      },
      ContentTag: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string", example: "Cartoons" },
          slug: { type: "string", example: "cartoons" },
          active: { type: "boolean", example: true },
          createdAt: { type: "string", format: "date-time", nullable: true },
          updatedAt: { type: "string", format: "date-time", nullable: true }
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
          item_type: { type: "string", example: "movie" },
          target_type: { type: "string", example: "content" },
          target_id: {
            type: "string",
            format: "uuid",
            example: "7d13c3a7-07d0-4f99-81a1-fb2efc42d1d8"
          },
          title: { $ref: "#/components/schemas/LocalizedText" },
          description: { $ref: "#/components/schemas/LocalizedText" },
          content_type: { type: "string", example: "movie" },
          category_id: { type: "string", nullable: true, example: "category-id" },
          series_id: { type: "string", nullable: true, example: "series-id" },
          series: {
            type: "array",
            items: {
              oneOf: [
                { type: "string" },
                { $ref: "#/components/schemas/ContentMovie" }
              ]
            }
          },
          tag_ids: {
            type: "array",
            items: { type: "string" },
            example: ["tag-id"]
          },
          tags: {
            type: "array",
            items: { $ref: "#/components/schemas/ContentTag" }
          },
          is_premium: { type: "boolean", example: false },
          likes_count: { type: "integer", example: 1 },
          is_liked: { type: "boolean", example: true },
          views_count: { type: "integer", example: 12 },
          play_count: { type: "integer", example: 12 },
          watch_time_sec: { type: "integer", example: 420 },
          last_viewed_at: { type: "string", format: "date-time", nullable: true },
          series_views_count: {
            type: "integer",
            example: 48,
            description: "Aggregated view count from episodes linked in this movie's series array."
          },
          series_watch_time_sec: {
            type: "integer",
            example: 3600,
            description: "Aggregated watch time from episodes linked in this movie's series array."
          },
          series_last_viewed_at: { type: "string", format: "date-time", nullable: true },
          poster_url: { type: "string", nullable: true, example: "/media/uploads/poster.png" },
          poster: {
            type: "object",
            nullable: true,
            properties: {
              url: { type: "string", nullable: true, example: "/media/uploads/poster.png" },
              storage_path: { type: "string", nullable: true },
              original_name: { type: "string", nullable: true, example: "poster.png" },
              mime_type: { type: "string", nullable: true, example: "image/png" },
              size: { type: "integer", nullable: true, example: 250000 }
            }
          },
          source: { type: "string", nullable: true, example: "/media/uploads/movie.mp4" },
          video_url: { type: "string", nullable: true, example: "/media/uploads/movie.mp4" },
          storage_path: { type: "string", nullable: true },
          transcode_status: { type: "string", example: "queued" },
          age_rating: { type: "integer", example: 6 },
          duration_sec: {
            type: "integer",
            example: 1234,
            description: "Video duration in seconds. For uploaded videos, the backend tries to read it with ffprobe."
          },
          duration_seconds: { type: "integer", example: 1234 },
          durationSec: { type: "integer", example: 1234 },
          duration: { type: "number", nullable: true, example: 1234 },
          duration_minutes: { type: "integer", example: 21 },
          durationMinutes: { type: "integer", example: 21 },
          year: { type: "integer", nullable: true, example: 2026 },
          published: { type: "boolean", example: false },
          published_at: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time", nullable: true },
          updatedAt: { type: "string", format: "date-time", nullable: true },
          media: {
            type: "object",
            properties: {
              has_source: { type: "boolean", example: true },
              original_name: { type: "string", nullable: true, example: "movie.mp4" },
              mime_type: { type: "string", nullable: true, example: "video/mp4" },
              size: { type: "integer", nullable: true, example: 1024000 },
              storage_path: { type: "string", nullable: true }
            }
          },
          playback: {
            type: "object",
            properties: {
              type: { type: "string", example: "hls" },
              status: { type: "string", example: "queued" },
              hls_url: { type: "string", nullable: true, example: "/media/hls/movie_id/master.m3u8" },
              auto_url: { type: "string", nullable: true, example: "/media/hls/movie_id/master.m3u8" },
              qualities: {
                type: "array",
                items: { type: "string" },
                example: ["auto", "360", "480", "720", "1080"]
              },
              renditions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    quality: { type: "string", example: "720" },
                    label: { type: "string", example: "720p" },
                    width: { type: "integer", nullable: true, example: 1280 },
                    height: { type: "integer", nullable: true, example: 720 },
                    bitrate: { type: "integer", nullable: true, example: 2800000 },
                    playlist_url: { type: "string", nullable: true, example: "/media/hls/movie_id/720p/index.m3u8" }
                  }
                }
              },
              error: { type: "string", nullable: true }
            }
          }
        }
      },
      LikeStatus: {
        type: "object",
        properties: {
          liked: { type: "boolean", example: true },
          content_id: { type: "string", example: "7d13c3a7-07d0-4f99-81a1-fb2efc42d1d8" },
          target_type: { type: "string", example: "content" },
          target_id: { type: "string", example: "7d13c3a7-07d0-4f99-81a1-fb2efc42d1d8" },
          item_type: { type: "string", example: "movie" },
          likes_count: { type: "integer", example: 1 },
          is_liked: { type: "boolean", example: true }
        }
      },
      ContentBlacklistStatus: {
        type: "object",
        properties: {
          blacklisted: { type: "boolean", example: true },
          is_blacklisted: { type: "boolean", example: true },
          content_id: { type: "string", example: "7d13c3a7-07d0-4f99-81a1-fb2efc42d1d8" },
          target_type: { type: "string", example: "content" },
          target_id: { type: "string", example: "7d13c3a7-07d0-4f99-81a1-fb2efc42d1d8" },
          item_type: { type: "string", example: "movie" },
          childId: { type: "string", example: "b219a2f6-0670-44ed-8e18-57f887bd4e94" },
          child_id: { type: "string", example: "b219a2f6-0670-44ed-8e18-57f887bd4e94" },
          deleted: { type: "boolean", example: false },
          blacklist_item: {
            nullable: true,
            allOf: [{ $ref: "#/components/schemas/ChildContentBlacklistItem" }]
          }
        }
      },
      ContentStatus: {
        type: "string",
        enum: ["uploaded", "transcoding", "ready", "failed"],
        example: "uploaded"
      },
      Content: {
        type: "object",
        properties: {
          age_rating: { type: "integer" },
          category_id: { type: "string" },
          created_at: { type: "string", format: "date-time" },
          created_by_id: { type: "string" },
          description: { $ref: "#/components/schemas/LocalizedText" },
          duration_sec: { type: "integer" },
          episode_number: { type: "integer" },
          id: { type: "string" },
          poster_url: { type: "string" },
          published: { type: "boolean" },
          published_at: { type: "string", format: "date-time" },
          season_number: { type: "integer" },
          series_id: { type: "string" },
          slug: { type: "string" },
          source_path: {
            type: "string",
            description: "relative under STORAGE_PATH"
          },
          status: { $ref: "#/components/schemas/ContentStatus" },
          title: { $ref: "#/components/schemas/LocalizedText" },
          updated_at: { type: "string", format: "date-time" },
          views_count: {
            type: "integer",
            description:
              "ViewsCount is incremented atomically each time a stream grant is issued. It counts grant events (play button presses), not individual HLS segments."
          },
          year: { type: "integer" }
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
          price: { type: "string", example: "49000.00" },
          price_cents: { type: "integer", example: 4900000 },
          currency: { type: "string", example: "UZS" },
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
          provider: { type: "string", enum: ["apple", "google", "click"], example: "click" },
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
      },
      PaymentProvider: {
        type: "string",
        enum: ["click", "payme", "stripe", "manual"],
        example: "click"
      },
      TransactionKind: {
        type: "string",
        enum: ["subscription", "topup", "refund"],
        example: "subscription"
      },
      TransactionStatus: {
        type: "string",
        enum: ["pending", "succeeded", "failed", "refunded", "canceled"],
        example: "pending"
      },
      Card: {
        type: "object",
        properties: {
          brand: { type: "string", example: "visa" },
          created_at: { type: "string", format: "date-time" },
          expiry_month: { type: "integer", example: 3 },
          expiry_year: { type: "integer", example: 2027 },
          holder_name: { type: "string", example: "Alisher Karimov" },
          id: { type: "string" },
          is_default: { type: "boolean", example: true },
          masked_pan: { type: "string", example: "8600****1234" },
          provider: { $ref: "#/components/schemas/PaymentProvider" },
          updated_at: { type: "string", format: "date-time" },
          user_id: { type: "string" },
          verified_at: { type: "string", format: "date-time" }
        }
      },
      Transaction: {
        type: "object",
        properties: {
          amount: { type: "string", example: "49000.00" },
          amount_cents: { type: "integer", example: 10000 },
          card_id: { type: "string" },
          checkout_url: { type: "string" },
          click_paydoc_id: { type: "string" },
          click_trans_id: { type: "string" },
          created_at: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          currency: { type: "string", example: "UZS" },
          description: { type: "string" },
          fiscal_sent_at: { type: "string", format: "date-time" },
          id: { type: "string" },
          kind: { $ref: "#/components/schemas/TransactionKind" },
          merchant_confirm_id: { type: "integer" },
          merchant_prepare_id: { type: "integer" },
          parentId: { type: "string" },
          plan_id: { type: "string" },
          processed_at: { type: "string", format: "date-time" },
          provider: { $ref: "#/components/schemas/PaymentProvider" },
          provider_ref: { type: "string" },
          status: { $ref: "#/components/schemas/TransactionStatus" },
          subscription_id: { type: "string" },
          tariffId: { type: "string" },
          updated_at: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          user_id: { type: "string" }
        }
      },
      TxListResponse: {
        type: "object",
        properties: {
          data: {
            type: "array",
            items: { $ref: "#/components/schemas/Transaction" }
          },
          limit: { type: "integer" },
          offset: { type: "integer" },
          total: { type: "integer" }
        }
      },
      CardTokenRequestResult: {
        type: "object",
        properties: {
          card_id: { type: "string" },
          phone_number: { type: "string" }
        }
      },
      CheckoutResult: {
        type: "object",
        properties: {
          checkout_url: { type: "string" },
          payment_url: { type: "string" },
          deeplink_url: { type: "string" },
          subscription: {
            nullable: true,
            allOf: [{ $ref: "#/components/schemas/Subscription" }]
          },
          transaction: { $ref: "#/components/schemas/Transaction" },
          tariff: { $ref: "#/components/schemas/Tariff" }
        }
      },
      ClickCheckoutRequest: {
        type: "object",
        required: ["tariff_id"],
        properties: {
          tariff_id: { type: "string", example: "premium" },
          tariffId: { type: "string", description: "Alias for tariff_id.", example: "premium" },
          plan_id: { type: "string", description: "Alias for tariff_id.", example: "premium" },
          amount: {
            type: "number",
            example: 49000,
            description: "Optional compatibility field. Backend uses the tariff price and rejects mismatched amounts."
          },
          amount_uzs: {
            type: "number",
            example: 49000,
            description: "Alias for amount."
          },
          amountUzs: {
            type: "number",
            example: 49000,
            description: "Alias for amount."
          },
          return_url: { type: "string", example: "https://astir.example/payments/return" },
          returnUrl: { type: "string", description: "Alias for return_url." },
          card_type: { type: "string", enum: ["uzcard", "humo"], example: "uzcard" },
          cardType: { type: "string", description: "Alias for card_type." },
          expires_at: { type: "string", format: "date-time" },
          expiresAt: { type: "string", format: "date-time", description: "Alias for expires_at." }
        }
      },
      ClickCallbackResponse: {
        type: "object",
        properties: {
          click_trans_id: { type: "integer", example: 123456789 },
          merchant_trans_id: { type: "string", example: "transaction-id" },
          merchant_prepare_id: { type: "integer", example: 123456 },
          merchant_confirm_id: { type: "integer", example: 123457 },
          error: { type: "integer", example: 0 },
          error_note: { type: "string", example: "Success" }
        }
      },
      ClickPaymentStatusResult: {
        type: "object",
        properties: {
          paymentID: { type: "integer" },
          paymentStatus: { type: "integer" }
        }
      },
      SeriesKind: {
        type: "string",
        enum: ["seasons", "episodes"],
        example: "seasons"
      },
      Series: {
        type: "object",
        properties: {
          active: { type: "boolean", example: true },
          created_at: { type: "string", format: "date-time" },
          description: { $ref: "#/components/schemas/LocalizedText" },
          id: { type: "string" },
          kind: { $ref: "#/components/schemas/SeriesKind" },
          poster_url: { type: "string" },
          slug: { type: "string" },
          title: { $ref: "#/components/schemas/LocalizedText" },
          updated_at: { type: "string", format: "date-time" }
        }
      },
      SeriesRequest: {
        type: "object",
        required: ["title"],
        properties: {
          active: { type: "boolean" },
          description: { $ref: "#/components/schemas/LocalizedText" },
          kind: { $ref: "#/components/schemas/SeriesKind" },
          title: { $ref: "#/components/schemas/LocalizedText" }
        }
      },
      FAQ: {
        type: "object",
        properties: {
          active: { type: "boolean" },
          answer: { $ref: "#/components/schemas/LocalizedText" },
          created_at: { type: "string", format: "date-time" },
          id: { type: "string" },
          question: { $ref: "#/components/schemas/LocalizedText" },
          sort_order: { type: "integer" },
          updated_at: { type: "string", format: "date-time" }
        }
      },
      LocalizedFAQ: {
        type: "object",
        properties: {
          answer: { type: "string" },
          id: { type: "string" },
          question: { type: "string" },
          sort_order: { type: "integer" }
        }
      },
      FAQRequest: {
        type: "object",
        required: ["answer", "question"],
        properties: {
          active: { type: "boolean" },
          answer: { $ref: "#/components/schemas/LocalizedText" },
          question: { $ref: "#/components/schemas/LocalizedText" },
          sort_order: { type: "integer" }
        }
      },
      SupportSenderRole: {
        type: "string",
        enum: ["user", "admin"],
        example: "user"
      },
      SupportChat: {
        type: "object",
        properties: {
          admin_unread_count: { type: "integer" },
          created_at: { type: "string", format: "date-time" },
          id: { type: "string" },
          last_message_at: { type: "string", format: "date-time" },
          last_message_preview: { type: "string" },
          updated_at: { type: "string", format: "date-time" },
          user: { $ref: "#/components/schemas/LegacyUser" },
          user_id: { type: "string" },
          user_unread_count: { type: "integer" }
        }
      },
      SupportMessage: {
        type: "object",
        properties: {
          attachment_name: { type: "string" },
          attachment_size: { type: "integer" },
          attachment_type: { type: "string" },
          attachment_url: { type: "string" },
          body: { type: "string" },
          chat_id: { type: "string" },
          created_at: { type: "string", format: "date-time" },
          id: { type: "string" },
          sender: { $ref: "#/components/schemas/LegacyUser" },
          sender_id: { type: "string" },
          sender_role: { $ref: "#/components/schemas/SupportSenderRole" },
          updated_at: { type: "string", format: "date-time" }
        }
      },
      UsersListResponse: {
        type: "object",
        properties: {
          data: {
            type: "array",
            items: { $ref: "#/components/schemas/LegacyUser" }
          },
          limit: { type: "integer" },
          offset: { type: "integer" },
          total: { type: "integer" }
        }
      },
      CreateStaffRequest: {
        type: "object",
        required: ["email", "name", "password", "role"],
        properties: {
          email: { type: "string" },
          name: { type: "string" },
          password: { type: "string", minLength: 8 },
          role: { type: "string", enum: ["admin", "super_admin"] }
        }
      },
      UpdateUserRequest: {
        type: "object",
        required: ["last_name", "name", "role"],
        properties: {
          last_name: { type: "string" },
          name: { type: "string" },
          role: { type: "string", enum: ["super_admin", "admin", "parent"] }
        }
      },
      AssignPlanRequest: {
        type: "object",
        required: ["plan_id"],
        properties: {
          duration_days: { type: "integer" },
          plan_id: { type: "string" }
        }
      },
      CardRequest: {
        type: "object",
        required: ["expiry_month", "expiry_year", "holder_name", "pan", "provider"],
        properties: {
          cvc: { type: "string" },
          expiry_month: { type: "integer" },
          expiry_year: { type: "integer" },
          holder_name: { type: "string" },
          pan: { type: "string", example: "8600123412341234" },
          provider: {
            type: "string",
            enum: ["click", "payme", "stripe"],
            example: "click"
          }
        }
      },
      ClickCardTokenRequestBody: {
        type: "object",
        required: ["expire_date", "pan"],
        properties: {
          expire_date: { type: "string", example: "0327" },
          pan: { type: "string", example: "8600550000003244" }
        }
      },
      ClickCardTokenVerifyBody: {
        type: "object",
        required: ["card_id", "sms_code"],
        properties: {
          card_id: { type: "string" },
          sms_code: { type: "integer" }
        }
      },
      CheckoutRequest: {
        type: "object",
        required: ["plan_id", "provider"],
        properties: {
          card_id: { type: "string" },
          plan_id: { type: "string" },
          provider: {
            type: "string",
            enum: ["click", "payme", "stripe"],
            example: "click"
          }
        }
      },
      DeeplinkCheckoutRequest: {
        type: "object",
        required: ["plan_id"],
        properties: {
          plan_id: { type: "string" }
        }
      },
      RecurringChargeRequest: {
        type: "object",
        required: ["card_id", "plan_id"],
        properties: {
          card_id: { type: "string" },
          plan_id: { type: "string" }
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
    "/v1/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Log in as parent",
        description: "Local API endpoint. Logs in a parent with email and password and returns a parent token.",
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
                    example: "parent@example.com"
                  },
                  password: {
                    type: "string",
                    example: "password123"
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
          400: {
            description: "Bad Request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          },
          401: {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
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
        description: "Legacy PostgreSQL API endpoint. Creates a parent account after OTP verification and returns an access/refresh token pair. Requires the verified email, name, password, and 4-digit PIN.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "name", "password", "pin"],
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
                  },
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
                oneOf: [
                  { required: ["id_token"] },
                  { required: ["idToken"] }
                ],
                properties: {
                  id_token: {
                    type: "string",
                    example: "eyJhbGci..."
                  },
                  idToken: {
                    type: "string",
                    description: "CamelCase alias for id_token.",
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
        summary: "Email/password login",
        description: "Legacy PostgreSQL API endpoint. Logs in a parent, admin, or super_admin user with email and password and returns an access/refresh token pair.",
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
                    example: "parent@example.com"
                  },
                  password: {
                    type: "string",
                    example: "password123"
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
                  { required: ["identityToken"] },
                  { required: ["id_token"] },
                  { required: ["idToken"] }
                ],
                properties: {
                  identity_token: {
                    type: "string",
                    example: "eyJhbGci..."
                  },
                  identityToken: {
                    type: "string",
                    description: "CamelCase alias for identity_token.",
                    example: "eyJhbGci..."
                  },
                  id_token: {
                    type: "string",
                    example: "eyJhbGci..."
                  },
                  idToken: {
                    type: "string",
                    description: "CamelCase alias for id_token.",
                    example: "eyJhbGci..."
                  },
                  email: {
                    type: "string",
                    description: "Optional fallback email when Apple does not include it in the token payload.",
                    example: "parent@example.com"
                  },
                  given_name: {
                    type: "string",
                    example: "Alisher"
                  },
                  givenName: {
                    type: "string",
                    description: "CamelCase alias for given_name.",
                    example: "Alisher"
                  },
                  family_name: {
                    type: "string",
                    example: "Karimov"
                  },
                  familyName: {
                    type: "string",
                    description: "CamelCase alias for family_name.",
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
    "/api/v1/auth/tv/confirm": {
      post: {
        tags: ["Auth"],
        summary: "TV: parent confirms pairing by scanning QR",
        description: "Legacy PostgreSQL API endpoint. Authenticated parent confirms the TV pairing code and receives the TV profile list.",
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
                schema: { $ref: "#/components/schemas/LegacyTVStatusResult" }
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
          403: {
            description: "Forbidden",
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
    "/api/v1/auth/tv/init": {
      post: {
        tags: ["TV"],
        summary: "TV: generate pairing QR",
        description: "Legacy PostgreSQL API endpoint. The TV app calls this on first launch and displays the returned QR. The parent scans it with POST /api/v1/auth/tv/confirm.",
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
          }
        }
      }
    },
    "/api/v1/auth/tv/profile": {
      post: {
        tags: ["TV"],
        summary: "TV: select who is watching",
        description: "Legacy PostgreSQL API endpoint. The TV app uses its device token to switch between parent and child playback and receives a short-lived streaming access token.",
        security: [{ legacyBearer: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  child_id: {
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
                schema: { $ref: "#/components/schemas/LegacyTVStreamSession" }
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
          403: {
            description: "Forbidden",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/v1/auth/tv/profiles": {
      get: {
        tags: ["TV"],
        summary: "TV: get current profile list",
        description: "Legacy PostgreSQL API endpoint. The TV app refreshes the list of available profiles using its device token.",
        security: [{ legacyBearer: [] }],
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyTVProfileList" }
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
          403: {
            description: "Forbidden",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/v1/auth/tv/{device_id}/status": {
      get: {
        tags: ["TV"],
        summary: "TV: poll for pairing confirmation",
        description: "Legacy PostgreSQL API endpoint. The TV app polls this after showing the QR. While pending, the response stays unauthenticated and returns a status payload.",
        parameters: [
          {
            name: "device_id",
            in: "path",
            required: true,
            description: "Device ID returned by /api/v1/auth/tv/init.",
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyTVStatusResult" }
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
                      uz: "Qurilma identifikatori noto'g'ri.",
                      ru: "Идентификатор устройства некорректен.",
                      en: "The device ID is invalid."
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
    "/api/v1/tv-devices": {
      get: {
        tags: ["TV"],
        summary: "List paired TV devices",
        description: "Legacy PostgreSQL API endpoint. Lists all TV devices linked to the authenticated parent account.",
        security: [{ legacyBearer: [] }],
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/LegacyTVDevice" }
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
          },
          403: {
            description: "Forbidden",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/v1/tv-devices/{id}": {
      delete: {
        tags: ["TV"],
        summary: "Revoke a paired TV device",
        description: "Legacy PostgreSQL API endpoint. Revokes a TV device so it can no longer select profiles or stream.",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "TV Device ID.",
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
          401: {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          403: {
            description: "Forbidden",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/v1/admin/logs": {
      get: {
        tags: ["Admin"],
        summary: "Read project log tails",
        description: "Returns tail lines from project log files and default PM2 app logs. Only known log locations are readable.",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "source",
            in: "query",
            required: false,
            schema: { type: "string", example: "all" },
            description: "Comma-separated source ids. Use all, pm2:out, pm2:error, project:<file>, or root:<file>."
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 1000, default: 200 },
            description: "Maximum number of lines per selected source."
          }
        ],
        responses: {
          200: {
            description: "Log lines",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          source: { type: "string", example: "pm2:error" },
                          source_label: { type: "string", example: "astir stderr" },
                          level: { type: "string", example: "error" },
                          text: { type: "string" },
                          parsed: {
                            type: "object",
                            nullable: true,
                            additionalProperties: true
                          }
                        }
                      }
                    },
                    limit: { type: "integer", example: 200 },
                    selected_sources: {
                      type: "array",
                      items: { type: "string" }
                    },
                    sources: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string", example: "pm2:out" },
                          label: { type: "string", example: "astir stdout" },
                          exists: { type: "boolean" }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          400: {
            description: "Unknown log source",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" }
        }
      }
    },
    "/api/v1/admin/cards": {
      get: {
        tags: ["Admin"],
        summary: "List all cards (admin)",
        description: "Legacy PostgreSQL API endpoint. Returns all saved cards platform-wide and optionally filters by user_id.",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "user_id",
            in: "query",
            required: false,
            description: "Filter by user UUID.",
            schema: { type: "string" }
          },
          {
            name: "limit",
            in: "query",
            required: false,
            description: "Page size.",
            schema: { type: "integer" }
          },
          {
            name: "offset",
            in: "query",
            required: false,
            description: "Offset.",
            schema: { type: "integer" }
          }
        ],
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyAdminCardListResponse" }
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
          403: {
            description: "Forbidden",
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
    "/api/v1/users": {
      get: {
        tags: ["Users"],
        summary: "List users (super_admin only)",
        description: "Legacy PostgreSQL API endpoint. Returns staff and parent accounts with pagination.",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "role",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["super_admin", "admin", "parent"]
            }
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer" }
          },
          {
            name: "offset",
            in: "query",
            required: false,
            schema: { type: "integer" }
          }
        ],
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UsersListResponse" }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" }
        }
      },
      post: {
        tags: ["Users"],
        summary: "Create an admin or super_admin (super_admin only)",
        description: "Legacy PostgreSQL API endpoint. Creates a staff account.",
        security: [{ legacyBearer: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateStaffRequest" }
            }
          }
        },
        responses: {
          201: {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyUser" }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" }
        }
      }
    },
    "/api/v1/users/{id}": {
      get: {
        tags: ["Users"],
        summary: "Get a user by ID (super_admin only)",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyUser" }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      },
      put: {
        tags: ["Users"],
        summary: "Update a user's profile and role (super_admin only)",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateUserRequest" }
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
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      },
      delete: {
        tags: ["Users"],
        summary: "Delete a user",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
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
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/api/v1/users/{id}/active": {
      patch: {
        tags: ["Users"],
        summary: "Activate or deactivate a user",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "id",
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
                required: ["active"],
                properties: {
                  active: { type: "boolean", example: true }
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
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/api/v1/users/{id}/plan": {
      post: {
        tags: ["Users"],
        summary: "Assign a plan to a user (super_admin)",
        description: "Legacy PostgreSQL API endpoint. Cancels current subscriptions and creates a new active subscription.",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AssignPlanRequest" }
            }
          }
        },
        responses: {
          201: {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Subscription" }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/api/v1/users/{id}/subscriptions": {
      get: {
        tags: ["Users"],
        summary: "List a user's subscriptions (super_admin)",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
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
                  items: { $ref: "#/components/schemas/Subscription" }
                }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/api/v1/users/{id}/cards": {
      get: {
        tags: ["Cards"],
        summary: "List cards for a specific user (admin)",
        description: "Returns all saved cards belonging to the given user. Token hash is included; the raw token is never exposed.",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
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
                  items: { $ref: "#/components/schemas/LegacyAdminCardView" }
                }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/api/v1/faqs": {
      get: {
        tags: ["FAQ"],
        summary: "List public FAQs",
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/LocalizedFAQ" }
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/admin/faqs": {
      get: {
        tags: ["FAQ"],
        summary: "List all FAQs (admin)",
        security: [{ legacyBearer: [] }],
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/FAQ" }
                }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" }
        }
      },
      post: {
        tags: ["FAQ"],
        summary: "Create a FAQ entry",
        security: [{ legacyBearer: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/FAQRequest" }
            }
          }
        },
        responses: {
          201: {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/FAQ" }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" }
        }
      }
    },
    "/api/v1/admin/faqs/{id}": {
      put: {
        tags: ["FAQ"],
        summary: "Update a FAQ entry",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/FAQRequest" }
            }
          }
        },
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/FAQ" }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      },
      delete: {
        tags: ["FAQ"],
        summary: "Delete a FAQ entry",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
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
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/api/v1/support/attachments/{path}": {
      get: {
        tags: ["Support"],
        summary: "Serve a support chat attachment",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "path",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "OK"
          },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/api/v1/support/chat": {
      get: {
        tags: ["Support"],
        summary: "Get the current user's support chat",
        security: [{ legacyBearer: [] }],
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SupportChat" }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" }
        }
      }
    },
    "/api/v1/support/chat/messages": {
      get: {
        tags: ["Support"],
        summary: "List messages in the current user's support chat",
        description: "Returns messages ordered ascending by time. Use after to poll for new messages or before to load older history.",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer" }
          },
          {
            name: "before",
            in: "query",
            required: false,
            schema: { type: "string" }
          },
          {
            name: "after",
            in: "query",
            required: false,
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
                  additionalProperties: true
                }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" }
        }
      },
      post: {
        tags: ["Support"],
        summary: "Send a message in the current user's support chat",
        security: [{ legacyBearer: [] }],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  body: { type: "string" },
                  message: {
                    type: "string",
                    description: "Alias for body."
                  },
                  text: {
                    type: "string",
                    description: "Alias for body."
                  },
                  content: {
                    type: "string",
                    description: "Alias for body."
                  }
                }
              }
            },
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  body: { type: "string" },
                  message: {
                    type: "string",
                    description: "Alias for body."
                  },
                  text: {
                    type: "string",
                    description: "Alias for body."
                  },
                  content: {
                    type: "string",
                    description: "Alias for body."
                  },
                  file: { type: "string", format: "binary" }
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
                schema: { $ref: "#/components/schemas/SupportMessage" }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" }
        }
      }
    },
    "/api/v1/support/chat/read": {
      post: {
        tags: ["Support"],
        summary: "Mark the user's support chat as read",
        security: [{ legacyBearer: [] }],
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyOkResponse" }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" }
        }
      }
    },
    "/api/v1/admin/support/chats": {
      get: {
        tags: ["Support"],
        summary: "List support chats (admin)",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer" }
          },
          {
            name: "offset",
            in: "query",
            required: false,
            schema: { type: "integer" }
          }
        ],
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true
                }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" }
        }
      }
    },
    "/api/v1/admin/support/chats/{id}": {
      get: {
        tags: ["Support"],
        summary: "Get a support chat (admin)",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SupportChat" }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/api/v1/admin/support/chats/{id}/messages": {
      get: {
        tags: ["Support"],
        summary: "List messages in a support chat (admin)",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" }
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer" }
          },
          {
            name: "before",
            in: "query",
            required: false,
            schema: { type: "string" }
          },
          {
            name: "after",
            in: "query",
            required: false,
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
                  additionalProperties: true
                }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      },
      post: {
        tags: ["Support"],
        summary: "Reply in a support chat (admin)",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  body: { type: "string" },
                  message: {
                    type: "string",
                    description: "Alias for body."
                  },
                  text: {
                    type: "string",
                    description: "Alias for body."
                  },
                  content: {
                    type: "string",
                    description: "Alias for body."
                  }
                }
              }
            },
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  body: { type: "string" },
                  message: {
                    type: "string",
                    description: "Alias for body."
                  },
                  text: {
                    type: "string",
                    description: "Alias for body."
                  },
                  content: {
                    type: "string",
                    description: "Alias for body."
                  },
                  file: { type: "string", format: "binary" }
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
                schema: { $ref: "#/components/schemas/SupportMessage" }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/api/v1/admin/support/chats/{id}/read": {
      post: {
        tags: ["Support"],
        summary: "Mark a support chat as read on the admin side",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
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
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" }
        }
      }
    },
    "/api/v1/cards": {
      get: {
        tags: ["Cards"],
        summary: "List my cards",
        security: [{ legacyBearer: [] }],
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Card" }
                }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" }
        }
      },
      post: {
        tags: ["Cards"],
        summary: "Tokenise and save a card",
        description: "Only brand + masked PAN + provider token are stored; raw PAN is never persisted.",
        security: [{ legacyBearer: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CardRequest" }
            }
          }
        },
        responses: {
          201: {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Card" }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" }
        }
      }
    },
    "/api/v1/cards/{id}": {
      delete: {
        tags: ["Cards"],
        summary: "Delete a card",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
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
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/api/v1/cards/{id}/default": {
      post: {
        tags: ["Cards"],
        summary: "Set a card as default",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
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
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/api/v1/billing/subscriptions": {
      get: {
        tags: ["Billing"],
        summary: "My subscriptions",
        security: [{ legacyBearer: [] }],
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Subscription" }
                }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" }
        }
      }
    },
    "/api/v1/billing/transactions": {
      get: {
        tags: ["Billing"],
        summary: "My transactions",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer" }
          },
          {
            name: "offset",
            in: "query",
            required: false,
            schema: { type: "integer" }
          }
        ],
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TxListResponse" }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" }
        }
      }
    },
    "/api/v1/billing/checkout": {
      post: {
        tags: ["Billing"],
        summary: "Start a subscription checkout",
        security: [{ legacyBearer: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CheckoutRequest" }
            }
          }
        },
        responses: {
          201: {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CheckoutResult" }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" }
        }
      }
    },
    "/api/v1/billing/checkout/deeplink": {
      post: {
        tags: ["Billing"],
        summary: "Start a deeplink / hosted-page checkout",
        security: [{ legacyBearer: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/DeeplinkCheckoutRequest" }
            }
          }
        },
        responses: {
          201: {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CheckoutResult" }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" }
        }
      }
    },
    "/api/v1/billing/charge/recurring": {
      post: {
        tags: ["Billing"],
        summary: "Charge a verified card token (recurring / subscription renewal)",
        security: [{ legacyBearer: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RecurringChargeRequest" }
            }
          }
        },
        responses: {
          201: {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CheckoutResult" }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" }
        }
      }
    },
    "/api/v1/payments/click/card/request": {
      post: {
        tags: ["Cards"],
        summary: "Step 1 - request a Click card token",
        security: [{ legacyBearer: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ClickCardTokenRequestBody" }
            }
          }
        },
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CardTokenRequestResult" }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" }
        }
      }
    },
    "/api/v1/payments/click/card/verify": {
      post: {
        tags: ["Cards"],
        summary: "Step 2 - verify card token with SMS OTP",
        security: [{ legacyBearer: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ClickCardTokenVerifyBody" }
            }
          }
        },
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Card" }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" }
        }
      }
    },
    "/api/v1/payments/click/mock-pay": {
      get: {
        tags: ["Billing"],
        summary: "DEV ONLY - mark a pending Click transaction as paid",
        parameters: [
          {
            name: "ref",
            in: "query",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Transaction" }
              }
            }
          },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/api/v1/payments/click/payment/{payment_id}/reversal": {
      delete: {
        tags: ["Billing"],
        summary: "Reverse (refund) a Click payment",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "payment_id",
            in: "path",
            required: true,
            schema: { type: "integer" }
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
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/api/v1/payments/click/payment/{payment_id}/status": {
      get: {
        tags: ["Billing"],
        summary: "Check Click payment status",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "payment_id",
            in: "path",
            required: true,
            schema: { type: "integer" }
          }
        ],
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ClickPaymentStatusResult" }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/api/v1/series": {
      get: {
        tags: ["Series"],
        summary: "List all active series",
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Series" }
                }
              }
            }
          }
        }
      },
      post: {
        tags: ["Series"],
        summary: "Create a series",
        description: "`kind` must be \"seasons\" or \"episodes\". Defaults to \"episodes\" if omitted.",
        security: [{ legacyBearer: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SeriesRequest" }
            }
          }
        },
        responses: {
          201: {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Series" }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" }
        }
      }
    },
    "/api/v1/series/{id}": {
      get: {
        tags: ["Series"],
        summary: "Get a series by ID",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Series" }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      },
      put: {
        tags: ["Series"],
        summary: "Update a series",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SeriesRequest" }
            }
          }
        },
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Series" }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      },
      delete: {
        tags: ["Series"],
        summary: "Delete a series",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
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
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/api/v1/series/{id}/episodes": {
      get: {
        tags: ["Series"],
        summary: "List episodes of a series ordered by season/episode number",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
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
                  items: { $ref: "#/components/schemas/Content" }
                }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/api/v1/series/{id}/poster": {
      get: {
        tags: ["Series"],
        summary: "Serve a series poster image (public)",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "OK"
          },
          400: { $ref: "#/components/responses/BadRequest" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      },
      post: {
        tags: ["Series"],
        summary: "Upload a poster for a series",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: {
                  file: { type: "string", format: "binary" }
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
                schema: { $ref: "#/components/schemas/Series" }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" }
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
    "/api/v1/children/{id}/pin": {
      put: {
        tags: ["Children"],
        summary: "Set or replace child PIN",
        description: "Legacy PostgreSQL API endpoint. Sets the 4-digit PIN for a child profile owned by the authenticated parent.",
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
    "/api/v1/users/{id}/children": {
      get: {
        tags: ["Children"],
        summary: "List children for any parent (admin)",
        description: "Legacy PostgreSQL API endpoint. Lists child profiles for the specified parent user.",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Parent user ID.",
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
      }
    },
    "/api/v1/users/{user_id}/children/{child_id}": {
      delete: {
        tags: ["Children"],
        summary: "Delete a child (admin)",
        description: "Legacy PostgreSQL API endpoint. Deletes a child profile for the specified parent user.",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "user_id",
            in: "path",
            required: true,
            description: "Parent user ID.",
            schema: { type: "string" }
          },
          {
            name: "child_id",
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
                    message: { type: "string", example: "deleted" }
                  }
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
      }
    },
    "/api/v1/users/{user_id}/children/{child_id}/active": {
      patch: {
        tags: ["Children"],
        summary: "Activate or deactivate a child (admin)",
        description: "Legacy PostgreSQL API endpoint. Updates the active flag for a child profile that belongs to the specified parent user.",
        security: [{ legacyBearer: [] }],
        parameters: [
          {
            name: "user_id",
            in: "path",
            required: true,
            description: "Parent user ID.",
            schema: { type: "string" }
          },
          {
            name: "child_id",
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
                required: ["active"],
                properties: {
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
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LegacyChild" }
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
    "/v1/children/{childId}/blacklist": {
      get: {
        tags: ["Children"],
        summary: "List child content blacklist",
        security: [{ parentToken: [] }, { deviceToken: [] }],
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
            description: "Child content blacklist",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    blacklist: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ChildContentBlacklistItem" }
                    }
                  }
                }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      },
      post: {
        tags: ["Children"],
        summary: "Add movie to child content blacklist",
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
                required: ["contentId"],
                properties: {
                  contentId: {
                    type: "string",
                    example: "7d13c3a7-07d0-4f99-81a1-fb2efc42d1d8"
                  },
                  content_id: {
                    type: "string",
                    example: "7d13c3a7-07d0-4f99-81a1-fb2efc42d1d8",
                    description: "Alias for contentId."
                  }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: "Movie added to child content blacklist",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    blacklist_item: { $ref: "#/components/schemas/ChildContentBlacklistItem" },
                    item: { $ref: "#/components/schemas/ChildContentBlacklistItem" }
                  }
                }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/v1/children/{childId}/blacklist/{contentId}": {
      delete: {
        tags: ["Children"],
        summary: "Remove movie from child content blacklist",
        security: [{ parentToken: [] }],
        parameters: [
          {
            name: "childId",
            in: "path",
            required: true,
            schema: { type: "string" }
          },
          {
            name: "contentId",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "Movie removed from child content blacklist",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    deleted: { type: "boolean", example: true },
                    contentId: { type: "string" },
                    content_id: { type: "string" }
                  }
                }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" }
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
                    limit: { $ref: "#/components/schemas/WatchLimit" },
                    blacklist: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ChildContentBlacklistItem" }
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
    "/v1/billing/click/checkout": {
      post: {
        tags: ["Billing"],
        summary: "Start Click checkout",
        description: "Creates a pending local transaction and returns a Click hosted payment URL. The frontend opens payment_url.",
        security: [{ parentToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ClickCheckoutRequest" }
            }
          }
        },
        responses: {
          201: {
            description: "Click checkout created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CheckoutResult" }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/v1/billing/click/checkout/deeplink": {
      post: {
        tags: ["Billing"],
        summary: "Start Click deeplink / hosted-page checkout",
        description: "Same as /v1/billing/click/checkout. The returned URL can open the Click app or fallback web payment page.",
        security: [{ parentToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ClickCheckoutRequest" }
            }
          }
        },
        responses: {
          201: {
            description: "Click deeplink checkout created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CheckoutResult" }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/v1/billing/click/transactions/{transactionId}": {
      get: {
        tags: ["Billing"],
        summary: "Get Click transaction status",
        security: [{ parentToken: [] }],
        parameters: [
          {
            name: "transactionId",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "Click transaction status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    transaction: { $ref: "#/components/schemas/Transaction" },
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
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/v1/billing/click/prepare": {
      post: {
        tags: ["Billing"],
        summary: "Click Prepare callback",
        description: "Callback URL for Click SHOP-API Prepare requests. Click sends action=0.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", additionalProperties: true }
            },
            "application/x-www-form-urlencoded": {
              schema: { type: "object", additionalProperties: true }
            }
          }
        },
        responses: {
          200: {
            description: "Click Prepare response",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ClickCallbackResponse" }
              }
            }
          }
        }
      }
    },
    "/v1/billing/click/complete": {
      post: {
        tags: ["Billing"],
        summary: "Click Complete callback",
        description: "Callback URL for Click SHOP-API Complete requests. Click sends action=1. Successful Complete activates the subscription.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", additionalProperties: true }
            },
            "application/x-www-form-urlencoded": {
              schema: { type: "object", additionalProperties: true }
            }
          }
        },
        responses: {
          200: {
            description: "Click Complete response",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ClickCallbackResponse" }
              }
            }
          }
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
                description: "snake_case and camelCase field names are both accepted.",
                required: ["tariff_id", "receipt", "provider_subscription_id"],
                properties: {
                  tariff_id: { type: "string", example: "premium" },
                  tariffId: { type: "string", description: "Alias for tariff_id.", example: "premium" },
                  receipt: { type: "string", example: "apple-receipt-data" },
                  receiptData: { type: "string", description: "Alias for receipt.", example: "apple-receipt-data" },
                  provider_subscription_id: { type: "string", example: "1000001234567890" },
                  providerSubscriptionId: { type: "string", description: "Alias for provider_subscription_id.", example: "1000001234567890" },
                  original_transaction_id: { type: "string", example: "1000001234567890" },
                  originalTransactionId: { type: "string", description: "Alias for original_transaction_id.", example: "1000001234567890" },
                  transaction_id: { type: "string", example: "1000001234567891" },
                  transactionId: { type: "string", description: "Alias for transaction_id.", example: "1000001234567891" },
                  expires_at: { type: "string", format: "date-time" },
                  expiresAt: { type: "string", format: "date-time", description: "Alias for expires_at." }
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
                description: "snake_case and camelCase field names are both accepted.",
                required: ["tariff_id", "purchase_token"],
                properties: {
                  tariff_id: { type: "string", example: "premium" },
                  tariffId: { type: "string", description: "Alias for tariff_id.", example: "premium" },
                  purchase_token: { type: "string", example: "google-purchase-token" },
                  purchaseToken: { type: "string", description: "Alias for purchase_token.", example: "google-purchase-token" },
                  product_id: { type: "string", example: "astir_premium_monthly" },
                  productId: { type: "string", description: "Alias for product_id.", example: "astir_premium_monthly" },
                  provider_subscription_id: { type: "string", example: "google-subscription-id" },
                  providerSubscriptionId: { type: "string", description: "Alias for provider_subscription_id.", example: "google-subscription-id" },
                  expires_at: { type: "string", format: "date-time" },
                  expiresAt: { type: "string", format: "date-time", description: "Alias for expires_at." }
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
                  can_watch_premium: { type: "boolean", example: true },
                  price: { type: "number", example: 49000 },
                  price_uzs: { type: "number", description: "Alias for price.", example: 49000 },
                  price_cents: { type: "integer", description: "Minor units. 49000 UZS = 4900000.", example: 4900000 },
                  currency: { type: "string", example: "UZS" }
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
                  can_watch_premium: { type: "boolean", example: true },
                  price: { type: "number", example: 49000 },
                  price_uzs: { type: "number", description: "Alias for price.", example: 49000 },
                  price_cents: { type: "integer", description: "Minor units. 49000 UZS = 4900000.", example: 4900000 },
                  currency: { type: "string", example: "UZS" }
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
    "/v1/content/likes": {
      get: {
        tags: ["Likes"],
        summary: "List liked content for the current actor",
        security: [{ parentToken: [] }, { deviceToken: [] }],
        responses: {
          200: {
            description: "Liked content list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: {
                        oneOf: [
                          { $ref: "#/components/schemas/ContentItem" },
                          { $ref: "#/components/schemas/ContentMovie" }
                        ]
                      }
                    },
                    likes: {
                      type: "array",
                      items: {
                        oneOf: [
                          { $ref: "#/components/schemas/ContentItem" },
                          { $ref: "#/components/schemas/ContentMovie" }
                        ]
                      }
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
    "/v1/content/{content_id}/blacklist": {
      get: {
        tags: ["Children"],
        summary: "Check whether a movie is blacklisted for a child",
        security: [{ parentToken: [] }],
        parameters: [
          {
            name: "content_id",
            in: "path",
            required: true,
            schema: { type: "string" }
          },
          {
            name: "childId",
            in: "query",
            required: false,
            description: "Child id for parent tokens. Alias: child_id. Device tokens use their paired child.",
            schema: { type: "string" }
          },
          {
            name: "child_id",
            in: "query",
            required: false,
            description: "Alias for childId.",
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "Content blacklist status",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ContentBlacklistStatus" }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      },
      post: {
        tags: ["Children"],
        summary: "Add a movie to a child's blacklist",
        description: "Idempotent: adding an already-blacklisted movie leaves one blacklist record. Parent tokens must pass childId; device tokens use their paired child.",
        security: [{ parentToken: [] }, { deviceToken: [] }],
        parameters: [
          {
            name: "content_id",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  childId: {
                    type: "string",
                    example: "b219a2f6-0670-44ed-8e18-57f887bd4e94",
                    description: "Required for parent tokens. Ignored for device tokens."
                  },
                  child_id: {
                    type: "string",
                    example: "b219a2f6-0670-44ed-8e18-57f887bd4e94",
                    description: "Alias for childId. Required for parent tokens. Ignored for device tokens."
                  }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: "Movie blacklisted for child",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ContentBlacklistStatus" }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      },
      delete: {
        tags: ["Children"],
        summary: "Remove a movie from a child's blacklist",
        description: "Idempotent: removing a movie that is not blacklisted is a no-op. Parent tokens must pass childId; device tokens use their paired child.",
        security: [{ parentToken: [] }, { deviceToken: [] }],
        parameters: [
          {
            name: "content_id",
            in: "path",
            required: true,
            schema: { type: "string" }
          },
          {
            name: "childId",
            in: "query",
            required: false,
            description: "Child id for parent tokens. Alias: child_id. Device tokens use their paired child.",
            schema: { type: "string" }
          },
          {
            name: "child_id",
            in: "query",
            required: false,
            description: "Alias for childId.",
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "Movie removed from child blacklist",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ContentBlacklistStatus" }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/v1/content/{content_id}/like": {
      get: {
        tags: ["Likes"],
        summary: "Check whether the current actor liked a content item",
        security: [{ parentToken: [] }, { deviceToken: [] }],
        parameters: [
          {
            name: "content_id",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "Like status",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LikeStatus" }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      },
      post: {
        tags: ["Likes"],
        summary: "Like a content item and save it to favorites",
        description: "Idempotent: liking an already-liked item leaves one favorite record.",
        security: [{ parentToken: [] }, { deviceToken: [] }],
        parameters: [
          {
            name: "content_id",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          201: {
            description: "Content liked",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LikeStatus" }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      },
      delete: {
        tags: ["Likes"],
        summary: "Unlike a content item and remove it from favorites",
        description: "Idempotent: unliking an item that is not liked is a no-op.",
        security: [{ parentToken: [] }, { deviceToken: [] }],
        parameters: [
          {
            name: "content_id",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "Content unliked",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LikeStatus" }
              }
            }
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/v1/content/movies": {
      get: {
        tags: ["Movies"],
        summary: "List movies",
        security: [{ parentToken: [] }, { deviceToken: [] }],
        parameters: [
          {
            name: "category",
            in: "query",
            required: false,
            description: "Filter by category id, slug, or localized title. Alias: category_id.",
            schema: { type: "string" }
          },
          {
            name: "category_id",
            in: "query",
            required: false,
            description: "Filter by category id. Alias: category.",
            schema: { type: "string" }
          },
          {
            name: "tags",
            in: "query",
            required: false,
            description: "Comma-separated tag ids, slugs, or names. All tags must match. Alias: tag_ids.",
            schema: { type: "string" }
          },
          {
            name: "tag_ids",
            in: "query",
            required: false,
            description: "Comma-separated tag ids. Alias: tags.",
            schema: { type: "string" }
          },
          {
            name: "q",
            in: "query",
            required: false,
            description: "Text search in movie title, description, or content type. Alias: search.",
            schema: { type: "string" }
          },
          {
            name: "search",
            in: "query",
            required: false,
            description: "Text search alias for q.",
            schema: { type: "string" }
          },
          {
            name: "liked",
            in: "query",
            required: false,
            description: "When true, return only movies liked by the current actor.",
            schema: { type: "boolean" }
          },
          {
            name: "page",
            in: "query",
            required: false,
            description: "Page number for paginated movie results.",
            schema: { type: "integer", minimum: 1, default: 1, example: 1 }
          },
          {
            name: "limit",
            in: "query",
            required: false,
            description: "Number of movies per page.",
            schema: { type: "integer", minimum: 1, default: 20, example: 20 }
          }
        ],
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
                    },
                    pagination: {
                      type: "object",
                      properties: {
                        page: { type: "integer", example: 1 },
                        limit: { type: "integer", example: 20 },
                        total: { type: "integer", example: 42 },
                        totalPages: { type: "integer", example: 3 },
                        hasNextPage: { type: "boolean", example: true },
                        hasPrevPage: { type: "boolean", example: false }
                      }
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
                    data: { $ref: "#/components/schemas/ContentMovie" },
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
        summary: "Update movie metadata or poster",
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
                  description: { $ref: "#/components/schemas/LocalizedText" },
                  category_id: { type: "string", nullable: true, example: "category-id" },
                  series_id: { type: "string", nullable: true, example: "series-id" },
                  content_type: { type: "string", example: "movie" },
                  year: { type: "integer", nullable: true, example: 2026 },
                  age_rating: { type: "integer", example: 6 },
                  duration_sec: {
                    type: "integer",
                    example: 1234,
                    description: "Optional fallback. For uploaded videos, backend-computed ffprobe duration has priority."
                  },
                  duration_seconds: { type: "integer", example: 1234 },
                  durationSec: { type: "integer", example: 1234 },
                  duration: { type: "integer", example: 1234 },
                  published: { type: "boolean", example: false },
                  is_premium: { type: "boolean", example: false },
                  tag_ids: {
                    type: "array",
                    items: { type: "string" }
                  },
                  tags: {
                    type: "array",
                    items: { type: "string" },
                    description: "Free-form tag names. Missing tags are created automatically."
                  }
                }
              }
            },
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  metadata: {
                    type: "string",
                    description: "Optional JSON with title, description, category_id, series_id, content_type, year, age_rating, duration aliases, published, is_premium, tag_ids, and tags. When video is uploaded, backend-computed ffprobe duration has priority."
                  },
                  poster: {
                    type: "string",
                    format: "binary",
                    description: "Poster image. The field name file is also accepted for compatibility."
                  },
                  file: {
                    type: "string",
                    format: "binary",
                    description: "Alias for poster."
                  }
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
                    data: { $ref: "#/components/schemas/ContentMovie" },
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
    "/v1/content/movies/{movie_id}/poster": {
      post: {
        tags: ["Movies"],
        summary: "Upload or replace movie poster",
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
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  poster: {
                    type: "string",
                    format: "binary",
                    description: "Poster image."
                  },
                  file: {
                    type: "string",
                    format: "binary",
                    description: "Alias for poster, used by legacy-style upload widgets."
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "Movie poster updated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/ContentMovie" },
                    movie: { $ref: "#/components/schemas/ContentMovie" }
                  }
                }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/v1/content/movies/{movie_id}/tags": {
      put: {
        tags: ["Movies"],
        summary: "Replace movie tags",
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
                  tag_ids: {
                    type: "array",
                    items: { type: "string" }
                  },
                  tags: {
                    type: "array",
                    items: { type: "string" },
                    description: "Free-form tag names. Missing tags are created automatically."
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "Movie tags replaced",
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
          401: { $ref: "#/components/responses/Unauthorized" },
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
                  category_id: { type: "string", nullable: true, example: "category-id" },
                  series_id: { type: "string", nullable: true, example: "series-id" },
                  content_type: { type: "string", example: "episode" },
                  year: { type: "integer", nullable: true, example: 2026 },
                  age_rating: { type: "integer", example: 6 },
                  duration_sec: {
                    type: "integer",
                    example: 1234,
                    description: "Optional fallback. For uploaded videos, backend-computed ffprobe duration has priority."
                  },
                  duration_seconds: { type: "integer", example: 1234 },
                  durationSec: { type: "integer", example: 1234 },
                  duration: { type: "integer", example: 1234 },
                  published: { type: "boolean", example: false },
                  is_premium: { type: "boolean", example: false },
                  tag_ids: {
                    type: "array",
                    items: { type: "string" }
                  },
                  tags: {
                    type: "array",
                    items: { type: "string" },
                    description: "Free-form tag names. Missing tags are created automatically."
                  }
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
                    description: "JSON with title, description, category_id, series_id, content_type, year, age_rating, duration aliases, published, is_premium, tag_ids, and tags. When video is uploaded, backend-computed ffprobe duration has priority."
                  },
                  video: {
                    type: "string",
                    format: "binary"
                  },
                  poster: {
                    type: "string",
                    format: "binary",
                    description: "Optional poster image."
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
                  category_id: { type: "string", nullable: true, example: "category-id" },
                  series_id: { type: "string", nullable: true, example: "series-id" },
                  content_type: { type: "string", example: "movie" },
                  year: { type: "integer", nullable: true, example: 2026 },
                  age_rating: { type: "integer", example: 6 },
                  duration_sec: {
                    type: "integer",
                    example: 1234,
                    description: "Optional fallback. For uploaded videos, backend-computed ffprobe duration has priority."
                  },
                  duration_seconds: { type: "integer", example: 1234 },
                  durationSec: { type: "integer", example: 1234 },
                  duration: { type: "integer", example: 1234 },
                  published: { type: "boolean", example: false },
                  tag_ids: {
                    type: "array",
                    items: { type: "string" }
                  },
                  tags: {
                    type: "array",
                    items: { type: "string" },
                    description: "Free-form tag names. Missing tags are created automatically."
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
                    description: "JSON with title, description, series, category_id, series_id, content_type, year, age_rating, duration aliases, published, is_premium, tag_ids, and tags. When video is uploaded, backend-computed ffprobe duration has priority."
                  },
                  video: {
                    type: "string",
                    format: "binary"
                  },
                  poster: {
                    type: "string",
                    format: "binary",
                    description: "Optional poster image."
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
                    data: { $ref: "#/components/schemas/ContentMovie" },
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
                  description: { $ref: "#/components/schemas/LocalizedText" },
                  type: { type: "string", example: "cartoon" },
                  slug: { type: "string", example: "cartoons" },
                  active: { type: "boolean", example: true }
                }
              }
            },
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  metadata: {
                    type: "string",
                    description: "JSON with title, description, type, slug, and/or active"
                  },
                  icon: {
                    type: "string",
                    format: "binary"
                  }
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
                  description: { $ref: "#/components/schemas/LocalizedText" },
                  type: { type: "string", example: "cartoon" },
                  slug: { type: "string", example: "cartoons" },
                  active: { type: "boolean", example: true }
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
                    description: "JSON with title, description, type, slug, and active"
                  },
                  icon: {
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
    "/v1/content/tags": {
      get: {
        tags: ["Tags"],
        summary: "List content tags",
        security: [{ parentToken: [] }, { deviceToken: [] }],
        responses: {
          200: {
            description: "Content tag list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    tags: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ContentTag" }
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
    "/v1/content/tags/{tag_id}": {
      get: {
        tags: ["Tags"],
        summary: "Get one content tag",
        security: [{ parentToken: [] }, { deviceToken: [] }],
        parameters: [
          {
            name: "tag_id",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "Content tag",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    tag: { $ref: "#/components/schemas/ContentTag" }
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
        tags: ["Tags"],
        summary: "Update one content tag",
        security: [{ parentToken: [] }],
        parameters: [
          {
            name: "tag_id",
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
                  name: { type: "string", example: "Learning" },
                  slug: { type: "string", example: "learning" },
                  active: { type: "boolean", example: true }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "Content tag updated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    tag: { $ref: "#/components/schemas/ContentTag" }
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
        tags: ["Tags"],
        summary: "Delete one content tag",
        security: [{ parentToken: [] }],
        parameters: [
          {
            name: "tag_id",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "Content tag deleted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    deleted: { type: "boolean", example: true },
                    tag: { $ref: "#/components/schemas/ContentTag" }
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
    "/v1/content/tags/create": {
      post: {
        tags: ["Tags"],
        summary: "Create a content tag",
        security: [{ parentToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string", example: "Cartoons" },
                  slug: { type: "string", example: "cartoons" },
                  active: { type: "boolean", example: true }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: "Content tag created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    tag: { $ref: "#/components/schemas/ContentTag" }
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
                  contentId: {
                    type: "string",
                    example: "7d13c3a7-07d0-4f99-81a1-fb2efc42d1d8",
                    description: "Catalog content id or /v1/content/movies movie id."
                  }
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
    "/v1/watch-sessions/{watchSessionId}/progress": {
      patch: {
        tags: ["Watch Sessions"],
        summary: "Update watch session progress",
        description: "Clients should call this every 10-15 seconds during playback. A view is counted once when watchedSec reaches 10 seconds.",
        security: [{ deviceToken: [] }],
        parameters: [
          {
            name: "watchSessionId",
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
                required: ["watchedSec"],
                properties: {
                  watchedSec: {
                    type: "integer",
                    minimum: 0,
                    description: "Cumulative seconds actually watched in this session."
                  },
                  positionSec: {
                    type: "integer",
                    minimum: 0,
                    description: "Current playback position in seconds."
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "Watch session progress saved",
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
          400: { $ref: "#/components/responses/BadRequest" },
          404: { $ref: "#/components/responses/NotFound" }
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

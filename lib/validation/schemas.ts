import { z } from "zod";
import { presetSettingsSchema } from "@/lib/writing-engine/presetSettings";
import { seoKeywordConfigSchema } from "@/lib/writing-engine/seoKeywords";

export const uuidSchema = z.string().uuid();

// --- Auth -----------------------------------------------------------------

export const emailSchema = z.email("Enter a valid email address.").trim().toLowerCase();

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(200, "Password is too long.");

export const signUpSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const logInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required."),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const projectNameSchema = z
  .string()
  .trim()
  .min(1, "Project name is required")
  .max(200, "Project name is too long");

export const projectDescriptionSchema = z
  .string()
  .trim()
  .max(2000, "Description is too long")
  .nullable()
  .optional();

export const createProjectSchema = z.object({
  name: projectNameSchema,
  description: projectDescriptionSchema,
});

export const updateProjectSchema = z.object({
  name: projectNameSchema.optional(),
  description: projectDescriptionSchema,
});

export const noteContentSchema = z
  .string()
  .trim()
  .min(1, "Note content is required")
  .max(50_000, "Note content is too long");

export const createTextNoteSchema = z.object({
  projectId: uuidSchema,
  content: noteContentSchema,
});

export const updateNoteSchema = z.object({
  title: z.string().trim().max(300).optional(),
  description: z.string().trim().max(1000).optional(),
  content: z.string().trim().max(50_000).optional(),
});

/**
 * The document types a user can currently create or select a preset for.
 * `youtube_script` is deliberately excluded — it is legacy-only (see
 * types/index.ts) and is never creatable again, though old rows of that
 * type may still exist and render read-only.
 */
export const documentTypeSchema = z.enum(["linkedin_post", "article", "newsletter", "summary"]);

export const documentInstructionsSchema = z
  .string()
  .trim()
  .max(5000, "Instructions are too long")
  .optional()
  .default("");

export const presetIdSchema = z.string().trim().min(1, "A writing preset is required").max(200);

export const createDocumentSchema = z
  .object({
    projectId: uuidSchema,
    type: documentTypeSchema,
    presetId: presetIdSchema,
    instructions: documentInstructionsSchema,
    /** Required (and validated) only when type === "article" — every Article is SEO-focused. */
    seoSettings: seoKeywordConfigSchema.optional(),
  })
  .refine((v) => v.type !== "article" || Boolean(v.seoSettings), {
    message: "A primary keyword is required for Article documents.",
    path: ["seoSettings"],
  });

export const updateDocumentSchema = z.object({
  title: z.string().trim().max(300).optional(),
  content: z.string().trim().max(200_000).optional(),
  /** Lets a legacy Article (created before SEO keywords were mandatory) add them after the fact. */
  seoSettings: seoKeywordConfigSchema.optional(),
});

export const aiEditDocumentSchema = z.object({
  instruction: z.string().trim().min(1, "Edit instruction is required").max(5000),
});

// --- Writing Presets ---------------------------------------------------

export const writingRuleSchema = z.string().trim().min(1).max(300);
export const writingRulesArraySchema = z.array(writingRuleSchema).max(20).default([]);

export const presetNameSchema = z.string().trim().min(1, "Preset name is required").max(120);
export const presetDescriptionSchema = z.string().trim().max(500).nullable().optional();

export const createPresetSchema = z
  .object({
    documentType: documentTypeSchema,
    name: presetNameSchema,
    description: presetDescriptionSchema,
    rules: writingRulesArraySchema,
    avoidRules: writingRulesArraySchema,
    settings: presetSettingsSchema.nullable().optional(),
  })
  .refine((v) => !v.settings || v.settings.typeSpecific.documentType === v.documentType, {
    message: "Settings do not match the selected document type.",
    path: ["settings"],
  });

export const updatePresetSchema = z.object({
  name: presetNameSchema.optional(),
  description: presetDescriptionSchema,
  rules: writingRulesArraySchema.optional(),
  avoidRules: writingRulesArraySchema.optional(),
  settings: presetSettingsSchema.nullable().optional(),
});

export const duplicatePresetSchema = z.object({
  presetId: presetIdSchema,
  documentType: documentTypeSchema,
  name: z.string().trim().max(120).optional(),
});

// --- Example Analysis ---------------------------------------------------

export const exampleTextSchema = z.string().trim().max(8000);

export const analyzeExamplesSchema = z
  .object({
    documentType: documentTypeSchema,
    positiveExample: exampleTextSchema.optional(),
    negativeExample: exampleTextSchema.optional(),
  })
  .refine((v) => Boolean(v.positiveExample?.length || v.negativeExample?.length), {
    message: "Provide at least one example to analyze.",
    path: ["positiveExample"],
  });

export const saveVersionSchema = z.object({
  content: z.string().trim().max(200_000).optional(),
});

export const restoreVersionSchema = z.object({
  versionNumber: z.number().int().positive(),
});

export const transcriptionRequestSchema = z.object({
  projectId: uuidSchema,
  noteType: z.enum(["recording", "audio_upload"]),
  durationSeconds: z.coerce.number().int().nonnegative().optional(),
});

export const chatMessageSchema = z.object({
  projectId: uuidSchema,
  message: z.string().trim().min(1, "Message is required").max(5000, "Message is too long"),
});

export const ALLOWED_AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
]);

export const MAX_AUDIO_FILE_BYTES = 25 * 1024 * 1024; // 25 MB (OpenAI transcription limit)

// --- Admin ------------------------------------------------------------

export const trialConfigSchema = z.object({
  trialDays: z.number().int().min(1, "Must be at least 1 day.").max(90, "Must be 90 days or fewer."),
  maxProjects: z.number().int().min(1).max(10_000),
  aiActionsLimit: z.number().int().min(1).max(1_000_000),
  transcriptionMinutesLimit: z.number().min(0).max(1_000_000),
  apiCostBudgetUsd: z.number().positive("Must be a positive amount.").max(100_000).nullable(),
});

export const setUserPlanSchema = z.object({
  planId: z.enum(["trial", "development"]),
});

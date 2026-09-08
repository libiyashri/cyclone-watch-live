import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const AnalyzeInput = z.object({
  imageName: z.string().min(1).max(200),
  /** full-size data URL sent to the model */
  imageDataUrl: z.string().startsWith("data:image/"),
  /** small data URL persisted as the history thumbnail */
  thumbnail: z.string().startsWith("data:image/").max(400_000),
  threshold: z.number().min(0).max(100).default(70),
});

const SYSTEM_PROMPT = `You are a meteorological satellite image analyst specialised in tropical cyclone detection (INSAT-3D, HURSAT and IBTrACS style imagery, both infrared and visible channels).

Classify the image as CYCLONE or NON_CYCLONE.
CYCLONE: organised rotating spiral cloud bands with a defined circulation centre or eye.
NON_CYCLONE: ordinary cloud fields, thunderstorms, monsoon cloud masses, squall lines, clear sky, or anything not a tropical cyclone. If the image is not satellite imagery at all, return NON_CYCLONE with low confidence and say so.

Reply with ONLY a JSON object:
{
  "label": "CYCLONE" | "NON_CYCLONE",
  "confidence": <number 0-100, how certain you are of the label>,
  "reasoning": "<one or two sentences of meteorological justification>",
  "features": ["<short observed feature>", "..."],
  "regions": [{"label":"<what it is>","x":<0-1>,"y":<0-1>,"r":<0-0.5>}]
}
"regions" marks up to 3 image areas that drove the decision, as fractions of image width/height.`;

export type AnalysisResult = {
  id: string;
  label: "CYCLONE" | "NON_CYCLONE";
  confidence: number;
  reasoning: string;
  features: string[];
  regions: { label: string; x: number; y: number; r: number }[];
  isAlert: boolean;
  imageName: string;
  createdAt: string;
};

export const analyzeImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AnalyzeInput.parse(input))
  .handler(async ({ data, context }): Promise<AnalysisResult> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured for this project.");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyse this satellite image." },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 429)
        throw new Error("Too many analyses right now — wait a moment and try again.");
      if (res.status === 402)
        throw new Error("AI credits are exhausted. Add credits to keep analysing images.");
      throw new Error(`Analysis failed (${res.status}): ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = json.choices?.[0]?.message?.content ?? "";
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, ""));
    } catch {
      throw new Error("The model returned an unreadable result. Try again.");
    }

    const label = String(parsed["label"] ?? "NON_CYCLONE").toUpperCase().includes("NON")
      ? "NON_CYCLONE"
      : "CYCLONE";
    const confidence = Math.max(
      0,
      Math.min(100, Number(parsed["confidence"] ?? 0) || 0),
    );
    const reasoning = String(parsed["reasoning"] ?? "");
    const features = Array.isArray(parsed["features"])
      ? (parsed["features"] as unknown[]).slice(0, 6).map((f) => String(f))
      : [];
    const regions = Array.isArray(parsed["regions"])
      ? (parsed["regions"] as Record<string, unknown>[]).slice(0, 3).map((r) => ({
          label: String(r["label"] ?? "region"),
          x: Math.min(1, Math.max(0, Number(r["x"]) || 0.5)),
          y: Math.min(1, Math.max(0, Number(r["y"]) || 0.5)),
          r: Math.min(0.5, Math.max(0.05, Number(r["r"]) || 0.18)),
        }))
      : [];

    const cycloneProbability = label === "CYCLONE" ? confidence : 100 - confidence;
    const isAlert = cycloneProbability >= data.threshold;

    const { data: row, error } = await context.supabase
      .from("predictions")
      .insert({
        user_id: context.userId,
        image_name: data.imageName,
        thumbnail: data.thumbnail,
        label,
        confidence,
        is_alert: isAlert,
        reasoning,
        features: { list: features, regions },
      })
      .select("id, created_at")
      .single();

    if (error) throw new Error(error.message);

    return {
      id: row.id as string,
      label,
      confidence,
      reasoning,
      features,
      regions,
      isAlert,
      imageName: data.imageName,
      createdAt: row.created_at as string,
    };
  });

export type PredictionRow = {
  id: string;
  image_name: string;
  thumbnail: string | null;
  label: string;
  confidence: number;
  is_alert: boolean;
  reasoning: string | null;
  created_at: string;
};

export const listPredictions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PredictionRow[]> => {
    const { data, error } = await context.supabase
      .from("predictions")
      .select("id, image_name, thumbnail, label, confidence, is_alert, reasoning, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as PredictionRow[];
  });

export const deletePrediction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("predictions")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

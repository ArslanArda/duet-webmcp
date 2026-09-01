import { Scale } from "@tonaljs/tonal";
import type { Locale } from "../types";
import { isValidChord, normalizeMode } from "./theory";

/**
 * Chord progressions by feeling. Every template is spelled in scale degrees
 * and realized with tonal in the project's key, so the agent picks from
 * musically valid options instead of inventing symbols.
 */
export const MOODS = ["happy", "sad", "dreamy", "tense", "epic", "jazzy", "calm"] as const;
export type Mood = (typeof MOODS)[number];

interface Template {
  label: Record<Locale, string>;
  mode: string;
  /** [degree 1-7, quality suffix] */
  steps: Array<[number, string]>;
  why: Record<Locale, string>;
}

const TEMPLATES: Record<Mood, Template[]> = {
  happy: [
    {
      label: { en: "Pop anthem", tr: "Pop marşı" },
      mode: "major",
      steps: [
        [1, ""],
        [5, ""],
        [6, "m"],
        [4, ""],
      ],
      why: {
        en: "I–V–vi–IV, the most sung-along progression in pop.",
        tr: "I–V–vi–IV, popun en çok eşlik edilen dizisi.",
      },
    },
    {
      label: { en: "Sunny", tr: "Güneşli" },
      mode: "major",
      steps: [
        [1, ""],
        [4, ""],
        [5, ""],
        [1, ""],
      ],
      why: {
        en: "I–IV–V–I: bright, simple and it always comes home.",
        tr: "I–IV–V–I: parlak, sade ve hep eve döner.",
      },
    },
    {
      label: { en: "Doo-wop", tr: "Doo-wop" },
      mode: "major",
      steps: [
        [1, ""],
        [6, "m"],
        [4, ""],
        [5, ""],
      ],
      why: {
        en: "I–vi–IV–V, the 50s progression: warm and nostalgic.",
        tr: "I–vi–IV–V, 50'ler dizisi: sıcak ve nostaljik.",
      },
    },
  ],
  sad: [
    {
      label: { en: "Bittersweet", tr: "Buruk" },
      mode: "minor",
      steps: [
        [1, "m"],
        [6, ""],
        [3, ""],
        [7, ""],
      ],
      why: {
        en: "i–VI–III–VII: minor but moving, the sound of many ballads.",
        tr: "i–VI–III–VII: minör ama hareketli, birçok baladın sesi.",
      },
    },
    {
      label: { en: "Lament", tr: "Ağıt" },
      mode: "minor",
      steps: [
        [1, "m"],
        [4, "m"],
        [5, "m"],
        [1, "m"],
      ],
      why: { en: "i–iv–v–i stays fully minor and heavy.", tr: "i–iv–v–i tamamen minör kalır, ağırdır." },
    },
    {
      label: { en: "Falling", tr: "Düşen" },
      mode: "minor",
      steps: [
        [1, "m"],
        [7, ""],
        [6, ""],
        [5, "7"],
      ],
      why: {
        en: "i–VII–VI–V7: a descending bass that pulls back to the tonic.",
        tr: "i–VII–VI–V7: toniğe geri çeken inen bir bas.",
      },
    },
  ],
  dreamy: [
    {
      label: { en: "Floating", tr: "Havada" },
      mode: "lydian",
      steps: [
        [1, "maj7"],
        [2, ""],
        [1, "maj7"],
        [2, ""],
      ],
      why: {
        en: "Lydian I–II with major sevenths: weightless and open.",
        tr: "Lidyen I–II ve majör yedililer: ağırlıksız ve açık.",
      },
    },
    {
      label: { en: "Soft focus", tr: "Yumuşak odak" },
      mode: "major",
      steps: [
        [1, "maj7"],
        [6, "m7"],
        [4, "maj7"],
        [5, "sus4"],
      ],
      why: {
        en: "Sevenths and a suspended V blur the edges.",
        tr: "Yedililer ve askıda V kenarları bulanıklaştırır.",
      },
    },
    {
      label: { en: "Nocturne", tr: "Noktürn" },
      mode: "dorian",
      steps: [
        [1, "m7"],
        [4, "7"],
        [1, "m7"],
        [2, "m7"],
      ],
      why: { en: "Dorian i–IV7: sad but with a lift.", tr: "Dorian i–IV7: hüzünlü ama yükselen." },
    },
  ],
  tense: [
    {
      label: { en: "Suspense", tr: "Gerilim" },
      mode: "phrygian",
      steps: [
        [1, "m"],
        [2, ""],
        [1, "m"],
        [2, ""],
      ],
      why: {
        en: "Phrygian i–II: the half step above the tonic never rests.",
        tr: "Frigyen i–II: toniğin yarım ses üstü hiç dinlenmez.",
      },
    },
    {
      label: { en: "Unresolved", tr: "Çözülmemiş" },
      mode: "minor",
      steps: [
        [1, "m"],
        [2, "dim"],
        [5, "7"],
        [1, "m"],
      ],
      why: {
        en: "The diminished ii and dominant V7 tighten before releasing.",
        tr: "Eksik ii ve dominant V7 bırakmadan önce gerer.",
      },
    },
    {
      label: { en: "Creeping", tr: "Sinsi" },
      mode: "minor",
      steps: [
        [1, "m"],
        [6, "maj7"],
        [2, "m7b5"],
        [5, "7"],
      ],
      why: {
        en: "Half-diminished ii and V7 make a dark jazz cadence.",
        tr: "Yarı eksik ii ve V7 karanlık bir caz kadansı kurar.",
      },
    },
  ],
  epic: [
    {
      label: { en: "Cinematic", tr: "Sinematik" },
      mode: "minor",
      steps: [
        [1, "m"],
        [6, ""],
        [7, ""],
        [1, "m"],
      ],
      why: {
        en: "i–VI–VII–i: the trailer progression, big and driving.",
        tr: "i–VI–VII–i: fragman dizisi, büyük ve sürükleyici.",
      },
    },
    {
      label: { en: "Rising", tr: "Yükselen" },
      mode: "minor",
      steps: [
        [1, "m"],
        [3, ""],
        [7, ""],
        [4, "m"],
      ],
      why: {
        en: "Wide leaps between chords feel heroic.",
        tr: "Akorlar arası geniş sıçramalar kahramanca hissettirir.",
      },
    },
    {
      label: { en: "Anthemic minor", tr: "Marş minörü" },
      mode: "minor",
      steps: [
        [6, ""],
        [7, ""],
        [1, "m"],
        [1, "m"],
      ],
      why: { en: "VI–VII–i lands hard on the tonic.", tr: "VI–VII–i toniğe sert iner." },
    },
  ],
  jazzy: [
    {
      label: { en: "ii–V–I", tr: "ii–V–I" },
      mode: "major",
      steps: [
        [2, "m7"],
        [5, "7"],
        [1, "maj7"],
        [1, "maj7"],
      ],
      why: { en: "The core jazz cadence.", tr: "Cazın çekirdek kadansı." },
    },
    {
      label: { en: "Minor ii–V", tr: "Minör ii–V" },
      mode: "minor",
      steps: [
        [2, "m7b5"],
        [5, "7"],
        [1, "m7"],
        [1, "m7"],
      ],
      why: {
        en: "The minor-key version, darker and smoother.",
        tr: "Minör versiyonu, daha karanlık ve akıcı.",
      },
    },
    {
      label: { en: "Turnaround", tr: "Dönüş" },
      mode: "major",
      steps: [
        [1, "maj7"],
        [6, "m7"],
        [2, "m7"],
        [5, "7"],
      ],
      why: { en: "I–vi–ii–V keeps circling back.", tr: "I–vi–ii–V döne döne başa gelir." },
    },
  ],
  calm: [
    {
      label: { en: "Still water", tr: "Durgun su" },
      mode: "major",
      steps: [
        [1, "add9"],
        [4, "add9"],
        [1, "add9"],
        [4, "add9"],
      ],
      why: {
        en: "Two chords with added ninths: nothing to resolve.",
        tr: "Dokuzlu eklenmiş iki akor: çözülecek bir şey yok.",
      },
    },
    {
      label: { en: "Lullaby", tr: "Ninni" },
      mode: "major",
      steps: [
        [1, ""],
        [4, ""],
        [1, ""],
        [5, "sus4"],
      ],
      why: { en: "Gentle I–IV rocking with a soft suspended V.", tr: "Yumuşak askıda V ile sallanan I–IV." },
    },
    {
      label: { en: "Evening", tr: "Akşam" },
      mode: "mixolydian",
      steps: [
        [1, ""],
        [7, ""],
        [4, ""],
        [1, ""],
      ],
      why: {
        en: "Mixolydian I–bVII–IV: relaxed and slightly folky.",
        tr: "Miksolidyen I–bVII–IV: rahat ve hafif folk.",
      },
    },
  ],
};

export interface ProgressionSuggestion {
  id: string;
  mood: Mood;
  label: string;
  mode: string;
  chords: string[];
  why: string;
}

function realize(keyCenter: string, template: Template, bars: number): string[] | null {
  const scale = Scale.get(`${keyCenter} ${normalizeMode(template.mode)}`);
  if (scale.empty) return null;
  const chords = template.steps.map(([degree, suffix]) => `${scale.notes[degree - 1]}${suffix}`);
  if (!chords.every(isValidChord)) return null;
  return Array.from({ length: bars }, (_, index) => chords[index % chords.length]);
}

export function suggestProgressions(
  keyCenter: string,
  mood: Mood,
  bars: number,
  locale: Locale,
): ProgressionSuggestion[] {
  return TEMPLATES[mood]
    .map((template, index) => {
      const chords = realize(keyCenter, template, bars);
      return chords
        ? {
            id: `${mood}-${index}`,
            mood,
            label: template.label[locale],
            mode: template.mode,
            chords,
            why: template.why[locale],
          }
        : null;
    })
    .filter((item): item is ProgressionSuggestion => item !== null);
}

export const MOOD_LABELS: Record<Mood, Record<Locale, string>> = {
  happy: { en: "happy", tr: "mutlu" },
  sad: { en: "sad", tr: "hüzünlü" },
  dreamy: { en: "dreamy", tr: "rüya gibi" },
  tense: { en: "tense", tr: "gergin" },
  epic: { en: "epic", tr: "epik" },
  jazzy: { en: "jazzy", tr: "caz" },
  calm: { en: "calm", tr: "sakin" },
};

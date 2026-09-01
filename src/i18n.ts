import type { Locale } from "./types";

export const dictionaries = {
  en: {
    tagline: "Human instinct, AI harmony.", key: "Key", tempo: "Tempo", midiReady: "MIDI ready",
    connectMidi: "Connect MIDI", midiUnavailable: "MIDI unavailable", siteToolsReady: "Site tools ready",
    manualMode: "Browser mode", startHere: "Start here", onboardingIntro: "Make one small move. AI can take it from there.",
    addNote: "Add a note", addNoteHint: "Click or tap an empty cell", selectBars: "Select bars",
    selectBarsHint: "Drag across the grid", askAi: "Ask your AI", askAiHint: "Copy a prompt and send it in chat",
    skip: "Skip", restartGuide: "Restart guide", draw: "Draw", select: "Select", erase: "Erase",
    melody: "Melody", bass: "Bass", chords: "Chords", you: "You", ai: "AI", play: "Play",
    pause: "Pause", stop: "Stop", loop: "Loop", record: "Record", recording: "Recording",
    undoAi: "Undo AI change", noChanges: "AI changes will appear here.", session: "Session",
    whatChanged: "What changed", tryAsking: "Try asking", exportMidi: "Export MIDI", quantize: "Quantize",
    enableSound: "Enable sound", soundReady: "Sound ready", bars: "bars", justNow: "just now",
    copied: "Prompt copied", chordPlaceholder: "Chord", editChord: "Edit chord", invalidChord: "That chord is not recognized.",
    changeUndone: "AI change undone", close: "Close", language: "Language", help: "Help",
    promptJazz: "Add jazz chords to bars 1–4", promptBass: "Write a bass line under it",
    promptMood: "Make bars 5–8 less sad", selected: "Selected", noSelection: "No bars selected",
    clearSelection: "Clear selection", clearBar: "Clear bar",
  },
  tr: {
    tagline: "İnsan sezgisi, AI armonisi.", key: "Ton", tempo: "Tempo", midiReady: "MIDI hazır",
    connectMidi: "MIDI bağla", midiUnavailable: "MIDI kullanılamıyor", siteToolsReady: "Site araçları hazır",
    manualMode: "Tarayıcı modu", startHere: "Buradan başla", onboardingIntro: "Küçük bir hamle yap. Devamını AI ile birlikte getirin.",
    addNote: "Bir nota ekle", addNoteHint: "Boş bir hücreye tıkla veya dokun", selectBars: "Ölçüleri seç",
    selectBarsHint: "Izgara üzerinde sürükle", askAi: "AI'a sor", askAiHint: "Prompt'u kopyalayıp sohbette gönder",
    skip: "Atla", restartGuide: "Rehberi yeniden başlat", draw: "Çiz", select: "Seç", erase: "Sil",
    melody: "Melodi", bass: "Bas", chords: "Akorlar", you: "Sen", ai: "AI", play: "Oynat",
    pause: "Duraklat", stop: "Durdur", loop: "Döngü", record: "Kaydet", recording: "Kayıt",
    undoAi: "AI değişikliğini geri al", noChanges: "AI değişiklikleri burada görünecek.", session: "Oturum",
    whatChanged: "Neler değişti", tryAsking: "Şunları deneyin", exportMidi: "MIDI dışa aktar", quantize: "Nicemleme",
    enableSound: "Sesi etkinleştir", soundReady: "Ses hazır", bars: "ölçü", justNow: "şimdi",
    copied: "Prompt kopyalandı", chordPlaceholder: "Akor", editChord: "Akoru düzenle", invalidChord: "Bu akor tanınmıyor.",
    changeUndone: "AI değişikliği geri alındı", close: "Kapat", language: "Dil", help: "Yardım",
    promptJazz: "1–4. ölçülere caz akorları ekle", promptBass: "Altına bir bas yürüyüşü yaz",
    promptMood: "5–8. ölçüleri daha az hüzünlü yap", selected: "Seçili", noSelection: "Ölçü seçilmedi",
    clearSelection: "Seçimi temizle", clearBar: "Ölçüyü temizle",
  },
} as const;

export type TranslationKey = keyof typeof dictionaries.en;
export const t = (locale: Locale, key: TranslationKey) => dictionaries[locale][key];

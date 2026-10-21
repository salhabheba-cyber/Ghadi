/**
 * Minimal interface translations. English, French and Modern Standard Arabic only (no dialects).
 * Covers the home screen, the main navigation and the home dialogs. Other pages are still English;
 * the dictionary can be extended key by key without touching components that do not use it.
 */
export const LANGUAGES = ["en", "fr", "ar"] as const;
export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  fr: "Français",
  ar: "العربية",
};

type Dict = {
  attachFile: string;
  pasteUrl: string;
  attachPhotos: string;
  prompt: string;
  navHome: string;
  navQuizzes: string;
  navLibrary: string;
  navProgress: string;
  quickQuiz: string;
  studyNotes: string;
  reviewCards: string;
  settings: string;
  language: string;
  xp: string;
  coins: string;
  xpHelp: string;
  coinsHelp: string;
  speech: string[];
  getStarted: string;
  close: string;
  importUrlTitle: string;
  importFileTitle: string;
  importPhotosTitle: string;
  promptTitle: string;
  promptLabel: string;
  promptPlaceholder: string;
  promptAsk: string;
  promptUseAsSource: string;
  promptNotConfigured: string;
  promptNeedsConsent: string;
  promptOffline: string;
  promptAiNotice: string;
  promptTopicQuiz: string;
  promptTopicQuizWorking: string;
  promptTopicQuizNotice: string;
  promptSaveAnswer: string;
  promptThinking: string;
  openSettings: string;
  // app shell navigation
  dashboard: string;
  documents: string;
  notes: string;
  flashcards: string;
  review: string;
  quizzes: string;
  library: string;
  mainNav: string;
};

export const DICTIONARY: Record<Language, Dict> = {
  en: {
    attachFile: "Attach File",
    pasteUrl: "Paste URL",
    attachPhotos: "Attach Photos",
    prompt: "Prompt",
    navHome: "Home",
    navQuizzes: "My Quizzes",
    navLibrary: "Library",
    navProgress: "Progress",
    quickQuiz: "Quick Quiz",
    studyNotes: "Study Notes",
    reviewCards: "Review Cards",
    settings: "Settings",
    language: "Language",
    xp: "XP",
    coins: "Coins",
    xpHelp: "XP: 1 per flashcard review plus 1 per correct quiz answer.",
    coinsHelp: "Coins: 1 per completed quiz plus 1 per day you studied.",
    speech: [
      "Let's study! 📚",
      "Ready to learn? ✨",
      "Upload a file! 🎓",
      "Quiz yourself! 🌸",
      "You've got this! 💜",
    ],
    getStarted: "What would you like to study?",
    close: "Close",
    importUrlTitle: "Import a web page",
    importFileTitle: "Import your files",
    importPhotosTitle: "Import photos",
    promptTitle: "What do you want to study?",
    promptTopicQuiz: "Make a practice quiz on this topic",
    promptTopicQuizWorking: "Making your quiz…",
    promptTopicQuizNotice:
      "This quiz comes from the AI's general knowledge, not from one of your documents. Check facts that matter. Using a cloud AI may cost money.",
    promptLabel: "Your prompt",
    promptPlaceholder: "e.g. Explain photosynthesis for a first-year biology exam",
    promptAsk: "Ask Ghadi AI",
    promptUseAsSource: "Save my text as a document",
    promptNotConfigured: "Ghadi AI is not set up on this server, so it cannot answer prompts.",
    promptNeedsConsent:
      "Prompts are sent to a hosted AI service. Turn on hosted AI and give your consent in Settings first.",
    promptOffline:
      "You can still save your own text as a document and generate notes, quizzes and flashcards from it offline.",
    promptAiNotice:
      "Written by AI from your prompt, not from a source document. Check it before relying on it.",
    promptSaveAnswer: "Save answer as a document",
    promptThinking: "Thinking",
    openSettings: "Open Settings",
    dashboard: "Dashboard",
    documents: "Documents",
    notes: "Study Notes",
    flashcards: "Flashcards",
    review: "Review",
    quizzes: "Quizzes",
    library: "My Library",
    mainNav: "Main",
  },
  fr: {
    attachFile: "Fichier",
    pasteUrl: "Coller un lien",
    attachPhotos: "Photos",
    prompt: "Requête",
    navHome: "Accueil",
    navQuizzes: "Mes quiz",
    navLibrary: "Bibliothèque",
    navProgress: "Progrès",
    quickQuiz: "Quiz rapide",
    studyNotes: "Notes d'étude",
    reviewCards: "Réviser les cartes",
    settings: "Paramètres",
    language: "Langue",
    xp: "XP",
    coins: "Pièces",
    xpHelp: "XP : 1 par carte révisée plus 1 par bonne réponse à un quiz.",
    coinsHelp: "Pièces : 1 par quiz terminé plus 1 par jour d'étude.",
    speech: [
      "Étudions ! 📚",
      "Prête à apprendre ? ✨",
      "Importe un fichier ! 🎓",
      "Fais un quiz ! 🌸",
      "Tu peux le faire ! 💜",
    ],
    getStarted: "Que veux-tu étudier ?",
    close: "Fermer",
    importUrlTitle: "Importer une page web",
    importFileTitle: "Importer vos fichiers",
    importPhotosTitle: "Importer des photos",
    promptTitle: "Que voulez-vous étudier ?",
    promptTopicQuiz: "Créer un quiz d’entraînement sur ce sujet",
    promptTopicQuizWorking: "Création du quiz…",
    promptTopicQuizNotice:
      "Ce quiz vient des connaissances générales de l’IA, pas d’un de vos documents. Vérifiez les faits importants. Une IA dans le cloud peut être payante.",
    promptLabel: "Votre requête",
    promptPlaceholder: "p. ex. Explique la photosynthèse pour un examen de biologie",
    promptAsk: "Demander à Ghadi IA",
    promptUseAsSource: "Enregistrer mon texte comme document",
    promptNotConfigured:
      "Ghadi IA n'est pas configurée sur ce serveur : elle ne peut pas répondre aux requêtes.",
    promptNeedsConsent:
      "Les requêtes sont envoyées à un service d'IA hébergé. Activez l'IA hébergée et donnez votre consentement dans les paramètres.",
    promptOffline:
      "Vous pouvez quand même enregistrer votre propre texte comme document et en générer hors ligne des notes, des quiz et des cartes.",
    promptAiNotice:
      "Rédigé par une IA à partir de votre requête, et non d'un document source. Vérifiez-le avant de vous y fier.",
    promptSaveAnswer: "Enregistrer la réponse comme document",
    promptThinking: "Réflexion",
    openSettings: "Ouvrir les paramètres",
    dashboard: "Tableau de bord",
    documents: "Documents",
    notes: "Notes d'étude",
    flashcards: "Cartes",
    review: "Révision",
    quizzes: "Quiz",
    library: "Ma bibliothèque",
    mainNav: "Principal",
  },
  ar: {
    attachFile: "إرفاق ملف",
    pasteUrl: "لصق رابط",
    attachPhotos: "إرفاق صور",
    prompt: "نص توجيهي",
    navHome: "الرئيسية",
    navQuizzes: "اختباراتي",
    navLibrary: "المكتبة",
    navProgress: "التقدم",
    quickQuiz: "اختبار سريع",
    studyNotes: "ملاحظات الدراسة",
    reviewCards: "مراجعة البطاقات",
    settings: "الإعدادات",
    language: "اللغة",
    xp: "نقاط الخبرة",
    coins: "العملات",
    xpHelp: "نقاط الخبرة: نقطة لكل بطاقة تمت مراجعتها ونقطة لكل إجابة صحيحة في الاختبارات.",
    coinsHelp: "العملات: عملة لكل اختبار مكتمل وعملة لكل يوم درست فيه.",
    speech: [
      "هيا ندرس! 📚",
      "مستعدة للتعلم؟ ✨",
      "ارفع ملفاً! 🎓",
      "اختبر نفسك! 🌸",
      "أنت قادر! 💜",
    ],
    getStarted: "ماذا تريد أن تدرس؟",
    close: "إغلاق",
    importUrlTitle: "استيراد صفحة ويب",
    importFileTitle: "استيراد ملفاتك",
    importPhotosTitle: "استيراد الصور",
    promptTitle: "ماذا تريد أن تدرس؟",
    promptTopicQuiz: "أنشئ اختبارًا تدريبيًا عن هذا الموضوع",
    promptTopicQuizWorking: "جارٍ إنشاء الاختبار…",
    promptTopicQuizNotice:
      "يعتمد هذا الاختبار على المعرفة العامة للذكاء الاصطناعي وليس على أحد مستنداتك. تحقق من المعلومات المهمة. قد يكون استخدام الذكاء الاصطناعي السحابي مدفوعًا.",
    promptLabel: "نصك التوجيهي",
    promptPlaceholder: "مثال: اشرح عملية البناء الضوئي لامتحان الأحياء",
    promptAsk: "اسأل غدي الذكي",
    promptUseAsSource: "احفظ نصي كمستند",
    promptNotConfigured: "الذكاء الاصطناعي في غدي غير مُعدّ على هذا الخادم، لذلك لا يمكنه الإجابة.",
    promptNeedsConsent:
      "تُرسل النصوص التوجيهية إلى خدمة ذكاء اصطناعي مستضافة. فعّل الذكاء الاصطناعي المستضاف وامنح موافقتك من الإعدادات أولاً.",
    promptOffline: "يمكنك مع ذلك حفظ نصك كمستند وإنشاء ملاحظات واختبارات وبطاقات منه دون اتصال.",
    promptAiNotice:
      "كتبه الذكاء الاصطناعي بناءً على نصك التوجيهي وليس من مستند مصدر. تحقّق منه قبل الاعتماد عليه.",
    promptSaveAnswer: "احفظ الإجابة كمستند",
    promptThinking: "جارٍ التفكير",
    openSettings: "فتح الإعدادات",
    dashboard: "لوحة المتابعة",
    documents: "المستندات",
    notes: "ملاحظات الدراسة",
    flashcards: "البطاقات",
    review: "المراجعة",
    quizzes: "الاختبارات",
    library: "مكتبتي",
    mainNav: "الرئيسية",
  },
};

export function isLanguage(v: unknown): v is Language {
  return typeof v === "string" && (LANGUAGES as readonly string[]).includes(v);
}

export function dirFor(lang: Language): "rtl" | "ltr" {
  return lang === "ar" ? "rtl" : "ltr";
}

import type { Locale } from "@/lib/schemas";

/**
 * Fixed phrases for the DEMO teacher, in the child's explanation language.
 * Arabic and French strings are unreviewed drafts and need a native-speaker review before pilot use.
 * Wording is warm but never shaming, never threatening, never asks the child to keep secrets.
 */
export interface Phrases {
  greeting: (name: string, title: string) => string;
  correct: string[];
  tryAgain: string;
  hintPrefix: string;
  correction: (explanation: string) => string;
  recap: (text: string, correct: number, total: number) => string;
  goodbye: string;
}

export const PHRASES: Record<Locale, Phrases> = {
  en: {
    greeting: (n, t) => `Hello ${n}! Today we will learn: ${t}. A grown-up can sit with us.`,
    correct: ["That's right. Well done!", "Yes, you found it!", "Great thinking!"],
    tryAgain: "Not quite. Let's try again together.",
    hintPrefix: "Here is a hint: ",
    correction: (e) => `That's okay, mistakes help us learn. ${e}`,
    recap: (t, c, n) => `${t} You answered ${c} of ${n} activities correctly on your own or with help.`,
    goodbye: "All done for today. Thank you for learning with me!",
  },
  fr: {
    greeting: (n, t) => `Bonjour ${n} ! Aujourd'hui, nous allons apprendre : ${t}. Un adulte peut rester avec nous.`,
    correct: ["C'est exact. Bravo !", "Oui, tu l'as trouvé !", "Bien réfléchi !"],
    tryAgain: "Pas tout à fait. Essayons encore ensemble.",
    hintPrefix: "Voici un indice : ",
    correction: (e) => `Ce n'est pas grave, les erreurs nous aident à apprendre. ${e}`,
    recap: (t, c, n) => `${t} Tu as réussi ${c} activités sur ${n}, seul ou avec de l'aide.`,
    goodbye: "C'est fini pour aujourd'hui. Merci d'avoir appris avec moi !",
  },
  ar: {
    greeting: (n, t) => `مرحباً ${n}! اليوم سنتعلم: ${t}. يمكن لأحد الكبار أن يجلس معنا.`,
    correct: ["صحيح. أحسنت!", "نعم، لقد وجدتها!", "تفكير جميل!"],
    tryAgain: "ليس تماماً. لنحاول مرة أخرى معاً.",
    hintPrefix: "إليك تلميحاً: ",
    correction: (e) => `لا بأس، الأخطاء تساعدنا على التعلم. ${e}`,
    recap: (t, c, n) => `${t} أجبت إجابة صحيحة عن ${c} من ${n} أنشطة، وحدك أو بمساعدة.`,
    goodbye: "انتهينا لهذا اليوم. شكراً لأنك تعلمت معي!",
  },
};

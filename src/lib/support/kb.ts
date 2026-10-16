import type { Locale } from "@/lib/schemas";

/**
 * Help-bot knowledge base. Every answer must state only what the app really does today (see docs/STATUS.md).
 * The bot is NOT an AI model: it matches keywords against these entries and otherwise offers to contact the team.
 * French and Arabic are unreviewed drafts.
 */
export interface KbEntry {
  id: string;
  keywords: string[]; // matched as substrings of the normalised message, any language
  answer: Record<Locale, string>;
}

export const KB: KbEntry[] = [
  { id: "trial", keywords: ["trial", "free", "essai", "gratuit", "تجرب", "مجان"], answer: {
    en: "Every new account gets a free 7-day trial with full access. After that, lessons need a subscription (US$5 per month). You can always view, export or delete your family's data, even without a subscription.",
    fr: "Chaque nouveau compte a 7 jours d'essai gratuit avec accès complet. Ensuite, les leçons demandent un abonnement (5 US$ par mois). Vous pouvez toujours voir, exporter ou supprimer les données de votre famille.",
    ar: "كل حساب جديد يحصل على تجربة مجانية لمدة 7 أيام بوصول كامل. بعدها تحتاج الدروس إلى اشتراك (5 دولارات شهريًا). يمكنك دائمًا عرض بيانات عائلتك أو تصديرها أو حذفها حتى بدون اشتراك." } },
  { id: "price", keywords: ["price", "cost", "how much", "monthly", "subscription", "prix", "coût", "combien", "abonnement", "سعر", "كم", "اشتراك", "تكلف"], answer: {
    en: "The plan is US$5 per month after the free 7-day trial. Nothing is charged automatically.",
    fr: "L'offre coûte 5 US$ par mois après les 7 jours d'essai gratuit. Rien n'est prélevé automatiquement.",
    ar: "الاشتراك 5 دولارات شهريًا بعد التجربة المجانية (7 أيام). لا يُسحب أي مبلغ تلقائيًا." } },
  { id: "pay", keywords: ["pay", "whish", "payment", "card", "paiement", "payer", "carte", "دفع", "ادفع", "ويش", "بطاقة"], answer: {
    en: "Open Grown-ups → Plan & billing. It shows how to pay: send US$5 by Whish Money and write your account email in the note. We confirm payments by hand and extend your access by 30 days once we see it. If your payment is not confirmed after a day or so, use \"Talk to the team\".",
    fr: "Ouvrez Espace adultes → Offre et facturation : la page explique comment payer. Envoyez 5 US$ par Whish Money et écrivez l'e-mail de votre compte dans la note. Nous confirmons à la main et prolongeons votre accès de 30 jours. Sans confirmation après un jour environ, utilisez « Parler à l'équipe ».",
    ar: "افتح منطقة الكبار ← الاشتراك والفوترة. تجد هناك طريقة الدفع: أرسل 5 دولارات عبر ويش موني واكتب بريد حسابك في الملاحظة. نؤكد الدفع يدويًا ونمدّد وصولك 30 يومًا. إذا لم يُؤكَّد دفعك بعد يوم تقريبًا فاستخدم «تحدث مع الفريق»." } },
  { id: "child", keywords: ["child", "profile", "add", "kid", "enfant", "profil", "ajouter", "طفل", "ملف", "اضاف", "إضاف"], answer: {
    en: "Go to Grown-ups → Add a child. Enter a nickname (a first name is enough), choose the age band and languages, and tick the two required consent boxes. Then tap Start learning on the child's card.",
    fr: "Allez dans Espace adultes → Ajouter un enfant. Indiquez un prénom ou surnom, la tranche d'âge et les langues, puis cochez les deux consentements obligatoires. Appuyez ensuite sur « Commencer » sur la carte de l'enfant.",
    ar: "اذهب إلى منطقة الكبار ← إضافة طفل. اكتب اسمًا أو لقبًا، واختر الفئة العمرية واللغات، وضع علامة على خانتي الموافقة المطلوبتين. ثم اضغط «ابدأ التعلم» على بطاقة الطفل." } },
  { id: "signin", keywords: ["sign in", "log in", "login", "mobile", "phone number", "sms", "code", "connexion", "connecter", "téléphone", "تسجيل الدخول", "دخول", "هاتف", "رمز"], answer: {
    en: "You can sign in with email and password. Signing in with a mobile number (a code by SMS) only works when the SMS service is switched on; the sign-in page tells you if it is not available.",
    fr: "Vous pouvez vous connecter avec e-mail et mot de passe. La connexion par numéro de mobile (code SMS) ne fonctionne que si le service SMS est activé ; la page de connexion l'indique sinon.",
    ar: "يمكنك الدخول بالبريد الإلكتروني وكلمة المرور. الدخول برقم الجوال (رمز عبر رسالة) يعمل فقط عند تفعيل خدمة الرسائل، وتخبرك صفحة الدخول إن لم يكن متاحًا." } },
  { id: "password", keywords: ["password", "forgot", "reset", "mot de passe", "oublié", "كلمة السر", "كلمة المرور", "نسيت"], answer: {
    en: "On the sign-in page choose \"Forgot password\". This works only when the email service is on; if it is not, use \"Talk to the team\" and we will help.",
    fr: "Sur la page de connexion, choisissez « Mot de passe oublié ». Cela ne fonctionne que si le service e-mail est activé ; sinon utilisez « Parler à l'équipe ».",
    ar: "في صفحة الدخول اختر «نسيت كلمة المرور». يعمل هذا فقط عند تفعيل خدمة البريد، وإلا فاستخدم «تحدث مع الفريق» لنساعدك." } },
  { id: "install", keywords: ["install", "home screen", "app", "installer", "écran d'accueil", "تثبيت", "تطبيق", "الشاشة الرئيسية"], answer: {
    en: "GHADI runs in your phone's browser and can be added to your home screen. On iPhone: Share → Add to Home Screen. On Android: the browser menu → Install app or Add to Home screen. It still needs an internet connection to learn.",
    fr: "GHADI fonctionne dans le navigateur et peut être ajouté à l'écran d'accueil. iPhone : Partager → Sur l'écran d'accueil. Android : menu du navigateur → Installer l'application. Une connexion internet reste nécessaire.",
    ar: "يعمل غادي في متصفح هاتفك ويمكن إضافته إلى الشاشة الرئيسية. في آيفون: مشاركة ← إضافة إلى الشاشة الرئيسية. في أندرويد: قائمة المتصفح ← تثبيت التطبيق. يلزم اتصال بالإنترنت للتعلم." } },
  { id: "teacher", keywords: ["artificial", "ai teacher", "is it ai", "teacher", "robot", "real person", "enseignant", "intelligence", "ذكاء", "معلم", "روبوت"], answer: {
    en: "The teacher is a computer program, not a person, and the lesson screen says so. Depending on the version, it follows a fixed script or uses an AI model for its friendly wording; the lesson content itself always comes from the approved lesson. It does not replace parents or teachers.",
    fr: "L'enseignant est un programme informatique, pas une personne, et l'écran de leçon le dit. Selon la version, il suit un script fixe ou utilise un modèle d'IA pour sa formulation ; le contenu de la leçon vient toujours de la leçon approuvée. Il ne remplace ni les parents ni les enseignants.",
    ar: "المعلم برنامج حاسوبي وليس شخصًا، وتذكر شاشة الدرس ذلك. بحسب الإصدار يتبع نصًا ثابتًا أو يستخدم نموذج ذكاء اصطناعي لصياغة كلامه، أما محتوى الدرس فيأتي دائمًا من الدرس المعتمد. لا يحل محل الأهل أو المعلمين." } },
  { id: "privacy", keywords: ["delete", "data", "privacy", "export", "remove", "supprimer", "données", "حذف", "بيانات", "خصوصية"], answer: {
    en: "Open a child's page under Grown-ups to export their data, delete their learning history, or delete the profile. At the bottom of the Grown-ups page you can delete your whole account. We do not sell data or show ads. See the Privacy page (a draft) in the footer.",
    fr: "Ouvrez la page d'un enfant dans Espace adultes pour exporter ses données, supprimer son historique ou supprimer le profil. En bas de la page, vous pouvez supprimer tout votre compte. Nous ne vendons pas de données et n'affichons pas de publicité.",
    ar: "افتح صفحة الطفل في منطقة الكبار لتصدير بياناته أو حذف سجل تعلمه أو حذف الملف. وفي أسفل صفحة منطقة الكبار يمكنك حذف حسابك بالكامل. لا نبيع البيانات ولا نعرض إعلانات." } },
  { id: "upload", keywords: ["upload", "photo", "scan", "pdf", "picture", "importer", "image", "رفع", "صورة"], answer: {
    en: "Grown-ups → Lesson uploads lets you add a photo or PDF (up to 5 MB). We read the text, you check and correct it, and then it becomes a reading and dictation text for your child. Files are private to your account. Reading is most accurate for English; French and Arabic reading is not tested yet.",
    fr: "Espace adultes → Import de leçons permet d'ajouter une photo ou un PDF (5 Mo max). Nous lisons le texte, vous le vérifiez, puis il devient un texte de lecture et de dictée. Les fichiers sont privés. La lecture est testée pour l'anglais ; le français et l'arabe ne le sont pas encore.",
    ar: "من منطقة الكبار ← رفع الدروس يمكنك إضافة صورة أو ملف PDF (حتى 5 ميغابايت). نقرأ النص وتراجعه وتصححه أنت ثم يصبح نص قراءة وإملاء لطفلك. الملفات خاصة بحسابك. القراءة مختبرة للإنجليزية فقط حتى الآن." } },
  { id: "practice", keywords: ["dictation", "reading", "practice", "dictée", "lecture", "إملاء", "قراءة"], answer: {
    en: "Dictation: the child listens (if the device has a voice) and types what they hear; we show which words differ. Reading practice: the child reads aloud and a grown-up taps any word that needed help. We do not listen to or score the child's voice.",
    fr: "Dictée : l'enfant écoute (si l'appareil a une voix) et tape ce qu'il entend ; nous montrons les mots différents. Lecture : l'enfant lit à voix haute et un adulte touche les mots difficiles. Nous n'écoutons ni ne notons la voix de l'enfant.",
    ar: "الإملاء: يستمع الطفل (إن كان في الجهاز صوت) ويكتب ما يسمعه ونُظهر الكلمات المختلفة. القراءة: يقرأ الطفل بصوت عالٍ ويضغط الكبير على الكلمات التي احتاج فيها مساعدة. لا نستمع إلى صوت الطفل ولا نقيّمه." } },
  { id: "ages", keywords: ["age", "old", "language", "arabic", "french", "âge", "langue", "arabe", "français", "عمر", "لغة", "عربي"], answer: {
    en: "The first lessons are for ages 3–5, with a grown-up nearby. The app is available in English, French and Arabic; French and Arabic are drafts not yet reviewed by native speakers, and only English lessons are offered to children for now.",
    fr: "Les premières leçons sont pour 3–5 ans, avec un adulte à proximité. L'appli existe en anglais, français et arabe ; le français et l'arabe sont des brouillons non relus, et seules les leçons en anglais sont proposées aux enfants pour l'instant.",
    ar: "الدروس الأولى للأعمار 3–5 سنوات بوجود شخص بالغ قريب. التطبيق متاح بالإنجليزية والفرنسية والعربية، والعربية والفرنسية نسختان أوليتان لم يراجعهما ناطقون أصليون، ودروس الأطفال حاليًا بالإنجليزية فقط." } },
  { id: "voice", keywords: ["microphone", "mic", "voice", "speak", "sound", "hear", "micro", "voix", "son", "ميكروفون", "صوت"], answer: {
    en: "The app does not use the microphone and never records your child. The teacher can read aloud using your device's built-in voice when it has one; if you hear nothing, check the volume and that your device has a text-to-speech voice. Everything also works by tapping or typing.",
    fr: "L'appli n'utilise pas le micro et n'enregistre jamais votre enfant. L'enseignant peut lire à voix haute avec la voix de l'appareil s'il en a une ; sinon vérifiez le volume. Tout fonctionne aussi en touchant ou en tapant.",
    ar: "لا يستخدم التطبيق الميكروفون ولا يسجل طفلك أبدًا. يمكن للمعلم القراءة بصوت عالٍ بصوت الجهاز إن وُجد، فإذا لم تسمع شيئًا فتحقق من مستوى الصوت. كل شيء يعمل أيضًا بالضغط أو الكتابة." } },
  { id: "cancel", keywords: ["cancel", "stop", "unsubscribe", "annuler", "arrêter", "إلغاء", "الغاء"], answer: {
    en: "Nothing renews automatically. To stop, just do not send the next payment; your access continues until the paid period ends. You can also delete your account from the Grown-ups page.",
    fr: "Rien ne se renouvelle automatiquement. Pour arrêter, n'envoyez simplement pas le prochain paiement ; l'accès continue jusqu'à la fin de la période payée. Vous pouvez aussi supprimer votre compte.",
    ar: "لا شيء يتجدد تلقائيًا. للتوقف لا ترسل الدفعة التالية، ويستمر وصولك حتى نهاية الفترة المدفوعة. ويمكنك أيضًا حذف حسابك من منطقة الكبار." } },
];

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[ً-ٟ]/g, "");

/** Returns the best entry, or null when nothing matches (the caller then offers to contact the team). */
export function findAnswer(message: string): KbEntry | null {
  const text = fold(message.slice(0, 500));
  let best: { e: KbEntry; score: number } | null = null;
  for (const e of KB) {
    let score = 0;
    for (const k of e.keywords) {
      const f = fold(k);
      // Short Latin words must match whole words ("app" must not match "happy"); longer ones and Arabic match as substrings.
      const hit = f.length <= 4 && /^[a-z ]+$/.test(f) ? new RegExp(`\\b${f}\\b`).test(text) : text.includes(f);
      if (hit) score += f.length >= 5 ? 2 : 1;
    }
    if (score > 0 && (!best || score > best.score)) best = { e, score };
  }
  return best?.e ?? null;
}

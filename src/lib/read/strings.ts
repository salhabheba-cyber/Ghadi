/**
 * Interface text for the Ghadi reading platform: English, French and Modern Standard Arabic (no dialects).
 * One table, three columns, so a missing translation is a type error rather than a silent English fallback.
 */
export type Lang = "ar" | "fr" | "en";
export const LANGS: Lang[] = ["ar", "fr", "en"];
export const LANG_NAMES: Record<Lang, string> = { ar: "العربية", fr: "Français", en: "English" };
export const dirOf = (l: Lang): "rtl" | "ltr" => (l === "ar" ? "rtl" : "ltr");

const T = {
  appTagline: {
    en: "Read more. Grow more.",
    fr: "Lis plus. Grandis plus.",
    ar: "اقرأ أكثر. انمُ أكثر.",
  },
  home: { en: "Home", fr: "Accueil", ar: "الرئيسية" },
  myBooks: { en: "My Books", fr: "Mes livres", ar: "كتبي" },
  explore: { en: "Explore", fr: "Explorer", ar: "استكشف" },
  progress: { en: "Progress", fr: "Progrès", ar: "تقدّمي" },
  studyTools: { en: "Study tools", fr: "Outils d'étude", ar: "أدوات الدراسة" },
  signOut: { en: "Sign out", fr: "Se déconnecter", ar: "تسجيل الخروج" },
  signIn: { en: "Sign in", fr: "Se connecter", ar: "تسجيل الدخول" },
  language: { en: "Language", fr: "Langue", ar: "اللغة" },
  loading: { en: "Loading…", fr: "Chargement…", ar: "جارٍ التحميل…" },
  retry: { en: "Try again", fr: "Réessayer", ar: "حاول مرة أخرى" },
  cancel: { en: "Cancel", fr: "Annuler", ar: "إلغاء" },
  save: { en: "Save", fr: "Enregistrer", ar: "حفظ" },
  close: { en: "Close", fr: "Fermer", ar: "إغلاق" },
  copy: { en: "Copy", fr: "Copier", ar: "نسخ" },
  copied: { en: "Copied", fr: "Copié", ar: "تم النسخ" },
  print: { en: "Print", fr: "Imprimer", ar: "طباعة" },
  next: { en: "Next", fr: "Suivant", ar: "التالي" },
  back: { en: "Back", fr: "Retour", ar: "رجوع" },
  genericError: {
    en: "Something went wrong. Please try again.",
    fr: "Un problème est survenu. Réessaie.",
    ar: "حدث خطأ. حاول مرة أخرى.",
  },
  notConfigured: {
    en: "Ghadi Reading is not switched on for this server yet. A database has to be connected first.",
    fr: "Ghadi Lecture n'est pas encore activé sur ce serveur. Une base de données doit d'abord être connectée.",
    ar: "لم يُفعَّل «غدي للقراءة» على هذا الخادم بعد. يجب ربط قاعدة بيانات أولًا.",
  },

  // join + login
  joinTitle: {
    en: "Join your school's reading club",
    fr: "Rejoins le club de lecture de ton école",
    ar: "انضم إلى نادي القراءة في مدرستك",
  },
  joinIntro: {
    en: "Ask your teacher for the school code.",
    fr: "Demande le code de l'école à ton enseignant.",
    ar: "اطلب رمز المدرسة من معلمك.",
  },
  schoolCode: { en: "School code", fr: "Code de l'école", ar: "رمز المدرسة" },
  schoolCodeHint: { en: "Looks like ABCD-1234", fr: "Ressemble à ABCD-1234", ar: "يشبه ABCD-1234" },
  findSchool: { en: "Find my school", fr: "Trouver mon école", ar: "ابحث عن مدرستي" },
  yourName: { en: "Your name", fr: "Ton prénom et nom", ar: "اسمك" },
  yourClass: { en: "Your class", fr: "Ta classe", ar: "صفّك" },
  chooseClass: { en: "Choose your class", fr: "Choisis ta classe", ar: "اختر صفّك" },
  yourAge: { en: "Your age", fr: "Ton âge", ar: "عمرك" },
  readIn: { en: "I like to read in", fr: "J'aime lire en", ar: "أحب القراءة بـ" },
  pinOptional: {
    en: "Secret PIN (optional, 4 to 6 digits)",
    fr: "Code secret (facultatif, 4 à 6 chiffres)",
    ar: "رقم سري (اختياري، من ٤ إلى ٦ أرقام)",
  },
  pinRequired: {
    en: "Secret PIN (4 to 6 digits)",
    fr: "Code secret (4 à 6 chiffres)",
    ar: "رقم سري (من ٤ إلى ٦ أرقام)",
  },
  pinWhy: {
    en: "A PIN stops other children from using your ID.",
    fr: "Le code empêche d'autres enfants d'utiliser ton identifiant.",
    ar: "الرقم السري يمنع الأطفال الآخرين من استخدام رقمك.",
  },
  createAccount: {
    en: "Create my reading account",
    fr: "Créer mon compte de lecture",
    ar: "أنشئ حسابي للقراءة",
  },
  noEmail: {
    en: "No email, phone number or address is needed.",
    fr: "Aucun e-mail, téléphone ni adresse n'est demandé.",
    ar: "لا حاجة إلى بريد إلكتروني أو هاتف أو عنوان.",
  },
  yourIdIs: { en: "Your Ghadi Student ID", fr: "Ton identifiant Ghadi", ar: "رقمك في غدي" },
  saveIdNow: {
    en: "Save this ID now. It is shown only once. You need it to come back.",
    fr: "Garde cet identifiant maintenant. Il n'est affiché qu'une fois. Il te faut pour revenir.",
    ar: "احفظ هذا الرقم الآن. يظهر مرة واحدة فقط، وستحتاجه للعودة.",
  },
  idSaved: { en: "I saved my ID", fr: "J'ai gardé mon identifiant", ar: "حفظتُ رقمي" },
  pendingApproval: {
    en: "Your teacher needs to approve your account before you can read. Keep your ID safe and try again later.",
    fr: "Ton enseignant doit approuver ton compte avant que tu puisses lire. Garde ton identifiant et reviens plus tard.",
    ar: "يجب أن يوافق معلمك على حسابك قبل أن تبدأ القراءة. احتفظ برقمك وعُد لاحقًا.",
  },
  idCard: { en: "Ghadi reading card", fr: "Carte de lecture Ghadi", ar: "بطاقة القراءة في غدي" },
  loginTitle: { en: "Welcome back", fr: "Content de te revoir", ar: "أهلًا بعودتك" },
  studentId: { en: "Ghadi Student ID", fr: "Identifiant Ghadi", ar: "رقم غدي" },
  pin: { en: "PIN", fr: "Code secret", ar: "الرقم السري" },
  lostId: {
    en: "Lost your ID? Ask your teacher. They will check who you are and give you a new one.",
    fr: "Identifiant perdu ? Demande à ton enseignant : il vérifiera ton identité et t'en donnera un nouveau.",
    ar: "ضاع رقمك؟ اطلب من معلمك. سيتحقق من هويتك ويعطيك رقمًا جديدًا.",
  },
  newHere: {
    en: "New here? Join with a school code",
    fr: "Nouveau ? Rejoins avec un code d'école",
    ar: "جديد هنا؟ انضم برمز المدرسة",
  },
  staffLogin: {
    en: "Teacher or school sign-in",
    fr: "Connexion enseignant ou école",
    ar: "دخول المعلمين والمدرسة",
  },
  rateLimited: {
    en: "Too many tries. Please wait a few minutes.",
    fr: "Trop d'essais. Attends quelques minutes.",
    ar: "محاولات كثيرة. انتظر بضع دقائق.",
  },

  // home
  welcome: { en: "Hello", fr: "Bonjour", ar: "مرحبًا" },
  continueReading: { en: "Continue reading", fr: "Continuer à lire", ar: "تابع القراءة" },
  nothingYet: {
    en: "Pick your first book to begin.",
    fr: "Choisis ton premier livre pour commencer.",
    ar: "اختر كتابك الأول لتبدأ.",
  },
  suggested: { en: "Picked for you", fr: "Choisis pour toi", ar: "مختارة لك" },
  booksFinished: { en: "books finished", fr: "livres terminés", ar: "كتب أنهيتها" },
  minutesRead: { en: "minutes read", fr: "minutes de lecture", ar: "دقائق قراءة" },
  dayStreak: {
    en: "reading days in a row",
    fr: "jours de lecture d'affilée",
    ar: "أيام قراءة متتالية",
  },
  badges: { en: "Badges", fr: "Badges", ar: "الشارات" },
  noBadges: {
    en: "Your first badge is waiting. Finish a book!",
    fr: "Ton premier badge t'attend. Termine un livre !",
    ar: "شارتك الأولى بانتظارك. أنهِ كتابًا!",
  },
  last14: { en: "Last 14 days", fr: "14 derniers jours", ar: "آخر ١٤ يومًا" },
  completedBooks: { en: "Finished books", fr: "Livres terminés", ar: "الكتب المنتهية" },
  inProgress: { en: "Reading now", fr: "En cours", ar: "أقرأها الآن" },
  emptyMyBooks: {
    en: "You have not opened any book yet.",
    fr: "Tu n'as encore ouvert aucun livre.",
    ar: "لم تفتح أي كتاب بعد.",
  },
  goExplore: { en: "Explore the library", fr: "Explorer la bibliothèque", ar: "استكشف المكتبة" },
  howProgress: { en: "How is this counted?", fr: "Comment est-ce compté ?", ar: "كيف يُحسب هذا؟" },
  howProgressBody: {
    en: "A book counts as finished when you have read at least 90% of it, spent enough real reading time, and answered a short question set about it. Opening a book again never counts twice. Reading time only grows while this page is open and you are using it.",
    fr: "Un livre est terminé quand tu en as lu au moins 90 %, passé assez de temps à lire pour de vrai et répondu à quelques questions. Rouvrir un livre ne compte jamais deux fois. Le temps de lecture n'augmente que lorsque la page est ouverte et que tu t'en sers.",
    ar: "يُعدّ الكتاب منتهيًا عندما تقرأ ٩٠٪ منه على الأقل، وتقضي وقتًا كافيًا في القراءة فعلًا، وتجيب عن أسئلة قصيرة عنه. فتح الكتاب مرة أخرى لا يُحسب مرتين. لا يزيد وقت القراءة إلا والصفحة مفتوحة وأنت تستخدمها.",
  },

  // leaderboard
  topReaders: { en: "Top 5 readers", fr: "Top 5 des lecteurs", ar: "أفضل ٥ قرّاء" },
  schoolView: { en: "My school", fr: "Mon école", ar: "مدرستي" },
  classView: { en: "My class", fr: "Ma classe", ar: "صفّي" },
  periodMonth: { en: "This month", fr: "Ce mois-ci", ar: "هذا الشهر" },
  periodYear: { en: "This school year", fr: "Cette année scolaire", ar: "هذا العام الدراسي" },
  periodAll: { en: "All time", fr: "Depuis le début", ar: "منذ البداية" },
  period: { en: "Period", fr: "Période", ar: "الفترة" },
  rank: { en: "Rank", fr: "Rang", ar: "المرتبة" },
  reader: { en: "Reader", fr: "Lecteur", ar: "القارئ" },
  books: { en: "Books", fr: "Livres", ar: "الكتب" },
  reward: { en: "Reward", fr: "Récompense", ar: "المكافأة" },
  you: { en: "You", fr: "Toi", ar: "أنت" },
  yourPlace: { en: "Your place", fr: "Ta place", ar: "مكانك" },
  noReadersYet: {
    en: "No finished books yet. Be the first!",
    fr: "Aucun livre terminé pour l'instant. Sois le premier !",
    ar: "لا كتب منتهية بعد. كن الأول!",
  },
  boardKind: {
    en: "This board celebrates reading. It is not a measure of who you are. Every finished book is a win.",
    fr: "Ce tableau fête la lecture. Il ne mesure pas qui tu es. Chaque livre terminé est une victoire.",
    ar: "هذه اللوحة تحتفي بالقراءة، ولا تقيس قيمتك. كل كتاب تنهيه هو إنجاز.",
  },
  moreTied: {
    en: "more readers share this rank",
    fr: "autres lecteurs partagent ce rang",
    ar: "قرّاء آخرون يشاركون هذه المرتبة",
  },
  tieRule: {
    en: "Readers with the same number of books share a rank.",
    fr: "Les lecteurs avec le même nombre de livres partagent le même rang.",
    ar: "القرّاء الذين أنهوا العدد نفسه من الكتب يتشاركون المرتبة نفسها.",
  },
  neutralReward: {
    en: "Ghadi reading badge",
    fr: "Badge de lecture Ghadi",
    ar: "شارة غدي للقراءة",
  },
  boardOff: {
    en: "Your school has not turned on the leaderboard.",
    fr: "Ton école n'a pas activé le classement.",
    ar: "لم تُفعّل مدرستك لوحة الصدارة.",
  },
  showMe: {
    en: "Show my name on the leaderboard",
    fr: "Afficher mon nom dans le classement",
    ar: "أظهر اسمي في لوحة الصدارة",
  },

  // explore
  searchBooks: {
    en: "Search title or author",
    fr: "Chercher un titre ou un auteur",
    ar: "ابحث عن عنوان أو مؤلف",
  },
  allLanguages: { en: "All languages", fr: "Toutes les langues", ar: "كل اللغات" },
  allAges: { en: "Any age", fr: "Tout âge", ar: "أي عمر" },
  allGenres: { en: "All kinds", fr: "Tous les genres", ar: "كل الأنواع" },
  allLevels: { en: "Any level", fr: "Tout niveau", ar: "أي مستوى" },
  ageFor: { en: "Age", fr: "Âge", ar: "العمر" },
  genre: { en: "Kind of book", fr: "Genre", ar: "النوع" },
  level: { en: "Reading level", fr: "Niveau de lecture", ar: "مستوى القراءة" },
  booksFound: { en: "books found", fr: "livres trouvés", ar: "كتابًا" },
  noBooksFound: {
    en: "No books match. Try fewer filters.",
    fr: "Aucun livre ne correspond. Essaie moins de filtres.",
    ar: "لا كتب مطابقة. جرّب مرشحات أقل.",
  },
  loadMore: { en: "Show more", fr: "Voir plus", ar: "عرض المزيد" },
  agesRange: { en: "Ages", fr: "Âges", ar: "الأعمار" },
  minutesShort: { en: "min", fr: "min", ar: "د" },
  catalogNote: {
    en: "Every book here is stored inside Ghadi and is free to read: public domain or openly licensed.",
    fr: "Chaque livre est stocké dans Ghadi et libre à la lecture : domaine public ou licence ouverte.",
    ar: "كل كتاب هنا مخزَّن داخل غدي ومتاح للقراءة مجانًا: ملكية عامة أو ترخيص مفتوح.",
  },

  // book page
  startReading: { en: "Start reading", fr: "Commencer à lire", ar: "ابدأ القراءة" },
  resume: { en: "Resume", fr: "Reprendre", ar: "تابع" },
  readAgain: { en: "Read again", fr: "Relire", ar: "اقرأ مرة أخرى" },
  finished: { en: "Finished", fr: "Terminé", ar: "منتهٍ" },
  aboutBook: { en: "About this book", fr: "À propos de ce livre", ar: "عن هذا الكتاب" },
  byAuthor: { en: "by", fr: "de", ar: "تأليف" },
  licenseAndCredit: { en: "License and credit", fr: "Licence et crédits", ar: "الترخيص والإسناد" },
  originalSource: { en: "Original source", fr: "Source d'origine", ar: "المصدر الأصلي" },
  formats: { en: "Format", fr: "Format", ar: "الصيغة" },
  formatDesc: {
    en: "Read inside Ghadi (text and pictures)",
    fr: "Lecture dans Ghadi (texte et images)",
    ar: "قراءة داخل غدي (نص وصور)",
  },
  bookNotFound: {
    en: "This book could not be found.",
    fr: "Ce livre est introuvable.",
    ar: "تعذّر العثور على هذا الكتاب.",
  },

  // reader
  contents: { en: "Contents", fr: "Sommaire", ar: "الفهرس" },
  bookmarks: { en: "Bookmarks", fr: "Signets", ar: "العلامات" },
  addBookmark: { en: "Bookmark this place", fr: "Ajouter un signet ici", ar: "ضع علامة هنا" },
  noBookmarks: { en: "No bookmarks yet.", fr: "Aucun signet.", ar: "لا علامات بعد." },
  searchInBook: {
    en: "Search in this book",
    fr: "Chercher dans ce livre",
    ar: "ابحث في هذا الكتاب",
  },
  noResults: { en: "No results.", fr: "Aucun résultat.", ar: "لا نتائج." },
  textSize: { en: "Text size", fr: "Taille du texte", ar: "حجم الخط" },
  spacing: { en: "Line spacing", fr: "Interligne", ar: "تباعد الأسطر" },
  theme: { en: "Page colour", fr: "Couleur de la page", ar: "لون الصفحة" },
  themeLight: { en: "Light", fr: "Clair", ar: "فاتح" },
  themeSepia: { en: "Sepia", fr: "Sépia", ar: "بُنّي" },
  themeDark: { en: "Dark", fr: "Sombre", ar: "داكن" },
  settings: { en: "Reading settings", fr: "Réglages de lecture", ar: "إعدادات القراءة" },
  prevPage: { en: "Previous page", fr: "Page précédente", ar: "الصفحة السابقة" },
  nextPage: { en: "Next page", fr: "Page suivante", ar: "الصفحة التالية" },
  pageOf: { en: "Page", fr: "Page", ar: "الصفحة" },
  of: { en: "of", fr: "sur", ar: "من" },
  readAloud: { en: "Read aloud", fr: "Lire à voix haute", ar: "قراءة بصوت عالٍ" },
  stopReading: { en: "Stop", fr: "Arrêter", ar: "إيقاف" },
  noVoice: {
    en: "This device has no voice for this language. You can still read the book.",
    fr: "Cet appareil n'a pas de voix pour cette langue. Tu peux quand même lire le livre.",
    ar: "لا يوجد في هذا الجهاز صوت لهذه اللغة. يمكنك مواصلة القراءة بنفسك.",
  },
  loadError: {
    en: "This book could not be opened. Check your connection and try again.",
    fr: "Ce livre n'a pas pu s'ouvrir. Vérifie ta connexion et réessaie.",
    ar: "تعذّر فتح هذا الكتاب. تحقق من الاتصال وحاول مرة أخرى.",
  },
  savedPlace: { en: "Place saved", fr: "Position enregistrée", ar: "حُفظ مكانك" },
  finishBook: { en: "I finished this book", fr: "J'ai fini ce livre", ar: "أنهيتُ هذا الكتاب" },
  almostThere: {
    en: "Keep reading to finish",
    fr: "Continue de lire pour terminer",
    ar: "تابع القراءة لتنهي الكتاب",
  },
  needMoreRead: {
    en: "You can finish this book after reading at least",
    fr: "Tu pourras terminer ce livre après avoir lu au moins",
    ar: "يمكنك إنهاء الكتاب بعد قراءة",
  },
  needMoreTime: {
    en: "and about this many more minutes:",
    fr: "et encore environ ce nombre de minutes :",
    ar: "وقضاء نحو هذا العدد من الدقائق:",
  },
  checkTitle: { en: "A few questions", fr: "Quelques questions", ar: "بضعة أسئلة" },
  checkIntro: {
    en: "Answer these to show you read the book.",
    fr: "Réponds pour montrer que tu as lu le livre.",
    ar: "أجب لتُظهر أنك قرأت الكتاب.",
  },
  checkSubmit: { en: "Check my answers", fr: "Vérifier mes réponses", ar: "تحقق من إجاباتي" },
  checkPassed: {
    en: "Well done! You finished this book.",
    fr: "Bravo ! Tu as terminé ce livre.",
    ar: "أحسنت! لقد أنهيت هذا الكتاب.",
  },
  checkFailed: {
    en: "Not quite yet. Read a little more and try again.",
    fr: "Pas encore. Relis un peu et réessaie.",
    ar: "ليس بعد. اقرأ قليلًا أكثر وحاول مرة أخرى.",
  },
  attemptsLeft: { en: "tries left", fr: "essais restants", ar: "محاولات متبقية" },
  newBadges: { en: "New badge!", fr: "Nouveau badge !", ar: "شارة جديدة!" },

  // AI companion
  helper: { en: "Reading helper", fr: "Aide à la lecture", ar: "مساعد القراءة" },
  helperOptional: {
    en: "Optional. You can read without it.",
    fr: "Facultatif. Tu peux lire sans.",
    ar: "اختياري. يمكنك القراءة بدونه.",
  },
  consentTitle: {
    en: "Use the AI reading helper?",
    fr: "Utiliser l'aide IA à la lecture ?",
    ar: "هل تريد استخدام مساعد القراءة الذكي؟",
  },
  consentBody: {
    en: "When you ask for help, Ghadi sends the sentence you chose and the book title to an AI service (OpenAI) to get an answer. Your name, school and ID are never sent. The helper can make mistakes, so check with the book or a grown-up. You can turn this off at any time.",
    fr: "Quand tu demandes de l'aide, Ghadi envoie la phrase choisie et le titre du livre à un service d'IA (OpenAI) pour obtenir une réponse. Ton nom, ton école et ton identifiant ne sont jamais envoyés. L'aide peut se tromper : vérifie avec le livre ou un adulte. Tu peux désactiver cela à tout moment.",
    ar: "عندما تطلب المساعدة، يرسل غدي الجملة التي اخترتها وعنوان الكتاب إلى خدمة ذكاء اصطناعي (OpenAI) للحصول على إجابة. لا يُرسل اسمك ولا مدرستك ولا رقمك أبدًا. قد يخطئ المساعد، فتحقق من الكتاب أو اسأل شخصًا بالغًا. يمكنك إيقاف ذلك في أي وقت.",
  },
  consentYes: { en: "Yes, use the helper", fr: "Oui, utiliser l'aide", ar: "نعم، استخدم المساعد" },
  consentNo: { en: "No thanks", fr: "Non merci", ar: "لا، شكرًا" },
  aiOff: {
    en: "The reading helper is not switched on for this server. Keep reading, everything else works.",
    fr: "L'aide à la lecture n'est pas activée sur ce serveur. Continue de lire, tout le reste fonctionne.",
    ar: "مساعد القراءة غير مفعَّل على هذا الخادم. تابع القراءة، فكل شيء آخر يعمل.",
  },
  selectText: {
    en: "Select a sentence in the book first.",
    fr: "Sélectionne d'abord une phrase dans le livre.",
    ar: "حدّد جملة في الكتاب أولًا.",
  },
  defineWord: {
    en: "What does this word mean?",
    fr: "Que veut dire ce mot ?",
    ar: "ما معنى هذه الكلمة؟",
  },
  simplify: { en: "Say it more simply", fr: "Dis-le plus simplement", ar: "اشرحها ببساطة" },
  askQuestion: { en: "Ask about this part", fr: "Poser une question", ar: "اسأل عن هذا الجزء" },
  wordGame: { en: "Word game", fr: "Jeu de mots", ar: "لعبة الكلمات" },
  yourQuestion: { en: "Your question", fr: "Ta question", ar: "سؤالك" },
  send: { en: "Send", fr: "Envoyer", ar: "إرسال" },
  thinking: { en: "Thinking…", fr: "Réflexion…", ar: "جارٍ التفكير…" },
  aiMayErr: {
    en: "The helper can make mistakes.",
    fr: "L'aide peut se tromper.",
    ar: "قد يخطئ المساعد.",
  },

  // staff
  staffTitle: {
    en: "Teacher and school sign-in",
    fr: "Connexion enseignants et école",
    ar: "دخول المعلمين والمدرسة",
  },
  email: { en: "Email", fr: "E-mail", ar: "البريد الإلكتروني" },
  password: { en: "Password", fr: "Mot de passe", ar: "كلمة المرور" },
  firstRunTitle: { en: "First-time setup", fr: "Première configuration", ar: "الإعداد الأول" },
  firstRunBody: {
    en: "No platform administrator exists yet. Enter the setup token from the server settings to create the first account.",
    fr: "Aucun administrateur de plateforme n'existe encore. Saisis le jeton de configuration des paramètres du serveur pour créer le premier compte.",
    ar: "لا يوجد مسؤول للمنصة بعد. أدخل رمز الإعداد من إعدادات الخادم لإنشاء الحساب الأول.",
  },
  setupToken: { en: "Setup token", fr: "Jeton de configuration", ar: "رمز الإعداد" },
  yourFullName: { en: "Your name", fr: "Ton nom", ar: "اسمك" },
} as const;

export type StrKey = keyof typeof T;
export function tr(lang: Lang, key: StrKey): string {
  return T[key][lang];
}

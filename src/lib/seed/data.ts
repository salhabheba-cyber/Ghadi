import type { ActivitySpec, LessonContent, Locale, Visual } from "@/lib/schemas";

/**
 * Original sample lessons written for GHADI's pilot. They are NOT taken from any textbook and make
 * NO claim of alignment with a national curriculum. Status "approved" here means developer-approved for demo;
 * an editorial/pedagogical review is still required before any public pilot (see README).
 */
export interface SeedActivity { spec: ActivitySpec; objective: string; skill: string }
export interface SeedLesson {
  slug: string;
  unit: 1 | 2;
  position: number;
  language: Locale;
  title: string;
  status: "approved" | "in_review";
  content: LessonContent;
  objectives: { code: string; description: string; skill: string }[];
  activities: SeedActivity[];
}

export const SEED_SKILLS = [
  { id: "color-recognition", domain: "Colours", name_en: "Recognise basic colours" },
  { id: "shape-recognition", domain: "Shapes", name_en: "Recognise basic shapes" },
  { id: "counting-1-5", domain: "Counting", name_en: "Count objects up to 5" },
  { id: "initial-sound-s", domain: "Phonological awareness", name_en: "Hear the starting sound /s/" },
];

const sw = (color: string): Visual => ({ type: "swatch", color });
const shape = (s: "circle" | "square" | "triangle", color = "#0F6B66"): Visual => ({ type: "shape", shape: s, color });
const em = (value: string): Visual => ({ type: "emoji", value });

function choice(phase: "guided" | "independent", prompt: string, opts: [string, string, Visual?][], correct: string, hints: string[], explanation: string, promptVisual?: Visual): ActivitySpec {
  return { kind: "choice", phase, prompt, promptVisual, options: opts.map(([id, label, visual]) => ({ id, label, visual })), correctOptionIds: [correct], hints, explanation };
}
function count(phase: "guided" | "independent", prompt: string, emoji: string, n: number, options: number[], hints: string[], explanation: string): ActivitySpec {
  return { kind: "count", phase, prompt, countVisual: { emoji, count: n }, options, correct: n, hints, explanation };
}

const RED = "#D64545", BLUE = "#2F6FDE", YELLOW = "#F2C230";

const colours: SeedLesson = {
  slug: "colours-red-blue-yellow", unit: 1, position: 1, language: "en", title: "Colours around us", status: "approved",
  content: {
    introduction: "Let's look at some colours together.",
    explanation: [
      { text: "This colour is red. A ripe tomato is red.", visual: sw(RED) },
      { text: "This colour is blue. The sky on a sunny day is blue.", visual: sw(BLUE) },
      { text: "This colour is yellow. A banana is yellow.", visual: sw(YELLOW) },
    ],
    recap: "Today we met three colours: red, blue and yellow.",
  },
  objectives: [{ code: "COL-1", description: "Recognise and name red, blue and yellow.", skill: "color-recognition" }],
  activities: [
    { objective: "COL-1", skill: "color-recognition", spec: choice("guided", "Tap the red one.", [["red", "Red", sw(RED)], ["blue", "Blue", sw(BLUE)], ["yellow", "Yellow", sw(YELLOW)]], "red", ["Think of a ripe tomato.", "Look for the colour of a tomato."], "Red is the colour of a ripe tomato.") },
    { objective: "COL-1", skill: "color-recognition", spec: choice("guided", "Tap the yellow one.", [["blue", "Blue", sw(BLUE)], ["yellow", "Yellow", sw(YELLOW)], ["red", "Red", sw(RED)]], "yellow", ["Think of a banana.", "A banana and the sun are this colour."], "Yellow is the colour of a banana.") },
    { objective: "COL-1", skill: "color-recognition", spec: choice("independent", "Tap the blue one.", [["yellow", "Yellow", sw(YELLOW)], ["red", "Red", sw(RED)], ["blue", "Blue", sw(BLUE)]], "blue", ["Think of the sky."], "Blue is the colour of the sky on a sunny day.") },
    { objective: "COL-1", skill: "color-recognition", spec: choice("independent", "Which colour is a banana?", [["red", "Red", sw(RED)], ["yellow", "Yellow", sw(YELLOW)], ["blue", "Blue", sw(BLUE)]], "yellow", ["Think of a banana."], "A banana is yellow.", em("🍌")) },
  ],
};

const countLesson: SeedLesson = {
  slug: "counting-to-five", unit: 2, position: 1, language: "en", title: "Counting to five", status: "approved",
  content: {
    introduction: "Let's count some stars together. A grown-up can point and count with you.",
    explanation: [
      { text: "One star. Let's say it together: one.", visual: em("⭐") },
      { text: "Two stars. Touch each star and say: one, two.", visual: em("⭐⭐") },
      { text: "Three stars. One, two, three.", visual: em("⭐⭐⭐") },
      { text: "Four and five stars. Touch each one as you count.", visual: em("⭐⭐⭐⭐⭐") },
    ],
    recap: "Today we practised counting up to five.",
  },
  objectives: [{ code: "CNT-1", description: "Count a group of up to five objects, one by one.", skill: "counting-1-5" }],
  activities: [
    { objective: "CNT-1", skill: "counting-1-5", spec: count("guided", "How many stars?", "⭐", 2, [1, 2, 3], ["Touch each star and count.", "Count out loud: one, two..."], "There are two stars.") },
    { objective: "CNT-1", skill: "counting-1-5", spec: count("guided", "How many stars?", "⭐", 4, [3, 4, 5], ["Touch each star and count.", "Count slowly, one at a time."], "There are four stars.") },
    { objective: "CNT-1", skill: "counting-1-5", spec: count("independent", "How many stars?", "⭐", 3, [2, 3, 4], ["Count one by one."], "There are three stars.") },
    { objective: "CNT-1", skill: "counting-1-5", spec: count("independent", "How many stars?", "⭐", 5, [4, 5, 6], ["Count one by one."], "There are five stars.") },
  ],
};

const SHAPE_COLOR = "#0F6B66";
const shapes: SeedLesson = {
  slug: "shapes-circle-square-triangle", unit: 1, position: 2, language: "en", title: "Shapes", status: "approved",
  content: {
    introduction: "Let's look at some shapes.",
    explanation: [
      { text: "This is a circle. It is round, like a ball.", visual: shape("circle") },
      { text: "This is a square. It has four sides that are the same length.", visual: shape("square") },
      { text: "This is a triangle. It has three sides.", visual: shape("triangle") },
    ],
    recap: "Today we met three shapes: circle, square and triangle.",
  },
  objectives: [{ code: "SHP-1", description: "Recognise and name a circle, a square and a triangle.", skill: "shape-recognition" }],
  activities: [
    { objective: "SHP-1", skill: "shape-recognition", spec: choice("guided", "Tap the circle.", [["square", "Square", shape("square", SHAPE_COLOR)], ["circle", "Circle", shape("circle", SHAPE_COLOR)], ["triangle", "Triangle", shape("triangle", SHAPE_COLOR)]], "circle", ["A circle is round, like a ball."], "A circle is round, with no corners.") },
    { objective: "SHP-1", skill: "shape-recognition", spec: choice("guided", "Tap the triangle.", [["triangle", "Triangle", shape("triangle", SHAPE_COLOR)], ["circle", "Circle", shape("circle", SHAPE_COLOR)], ["square", "Square", shape("square", SHAPE_COLOR)]], "triangle", ["A triangle has three sides."], "A triangle has three sides and three corners.") },
    { objective: "SHP-1", skill: "shape-recognition", spec: choice("independent", "Tap the square.", [["circle", "Circle", shape("circle", SHAPE_COLOR)], ["triangle", "Triangle", shape("triangle", SHAPE_COLOR)], ["square", "Square", shape("square", SHAPE_COLOR)]], "square", ["A square has four equal sides."], "A square has four sides that are the same length.") },
    { objective: "SHP-1", skill: "shape-recognition", spec: choice("independent", "Which shape is round?", [["square", "Square", shape("square", SHAPE_COLOR)], ["circle", "Circle", shape("circle", SHAPE_COLOR)], ["triangle", "Triangle", shape("triangle", SHAPE_COLOR)]], "circle", ["Think of a ball."], "A circle is the round shape.") },
  ],
};

const soundS: SeedLesson = {
  slug: "first-sound-sss", unit: 2, position: 2, language: "en", title: "The sound sss", status: "approved",
  content: {
    introduction: "Let's listen for a sound at the start of words.",
    explanation: [
      { text: "Listen: sun. The first sound in sun is sss. Say it with me: sss.", visual: em("☀️") },
      { text: "Sock also starts with sss. Sss-sock!", visual: em("🧦") },
      { text: "Snake starts with sss too. Can you hiss like a snake?", visual: em("🐍") },
    ],
    recap: "Today we listened for the sound sss at the start of words like sun, sock and snake.",
  },
  objectives: [{ code: "PHO-1", description: "Pick a picture whose name starts with the sound /s/.", skill: "initial-sound-s" }],
  activities: [
    { objective: "PHO-1", skill: "initial-sound-s", spec: choice("guided", "Which word starts with sss, like sun?", [["sock", "Sock", em("🧦")], ["ball", "Ball", em("⚽")], ["hat", "Hat", em("🎩")]], "sock", ["Say each word slowly. Listen for sss."], "Sock starts with the sound sss, like sun.", em("☀️")) },
    { objective: "PHO-1", skill: "initial-sound-s", spec: choice("guided", "Which word starts with sss, like sun?", [["dog", "Dog", em("🐶")], ["cat", "Cat", em("🐱")], ["snake", "Snake", em("🐍")]], "snake", ["Say each word slowly. Listen for sss."], "Snake starts with the sound sss.", em("☀️")) },
    { objective: "PHO-1", skill: "initial-sound-s", spec: choice("independent", "Which word starts with sss, like sun?", [["star", "Star", em("⭐")], ["moon", "Moon", em("🌙")], ["fish", "Fish", em("🐟")]], "star", ["Say each word slowly."], "Star starts with the sound sss.", em("☀️")) },
    { objective: "PHO-1", skill: "initial-sound-s", spec: choice("independent", "Which word starts with sss, like sun?", [["cup", "Cup", em("☕")], ["bed", "Bed", em("🛏️")], ["spoon", "Spoon", em("🥄")]], "spoon", ["Say each word slowly."], "Spoon starts with the sound sss.", em("☀️")) },
  ],
};

/** Drafts for localisation workflow: seeded as in_review so they are NOT served to children until reviewed. */
const countFr: SeedLesson = {
  slug: "counting-to-five-fr", unit: 2, position: 3, language: "fr", title: "Compter jusqu'à cinq", status: "in_review",
  content: {
    introduction: "Comptons des étoiles ensemble.",
    explanation: [
      { text: "Une étoile. Disons ensemble : un.", visual: em("⭐") },
      { text: "Deux étoiles. Touche chaque étoile : un, deux.", visual: em("⭐⭐") },
      { text: "Trois étoiles. Un, deux, trois.", visual: em("⭐⭐⭐") },
    ],
    recap: "Aujourd'hui, nous avons compté jusqu'à cinq.",
  },
  objectives: [{ code: "CNT-FR-1", description: "Compter un groupe de un à cinq objets, un par un.", skill: "counting-1-5" }],
  activities: [
    { objective: "CNT-FR-1", skill: "counting-1-5", spec: count("guided", "Combien d'étoiles ?", "⭐", 2, [1, 2, 3], ["Touche chaque étoile et compte."], "Il y a deux étoiles.") },
    { objective: "CNT-FR-1", skill: "counting-1-5", spec: count("independent", "Combien d'étoiles ?", "⭐", 3, [2, 3, 4], ["Compte une par une."], "Il y a trois étoiles.") },
  ],
};
const countAr: SeedLesson = {
  slug: "counting-to-five-ar", unit: 2, position: 4, language: "ar", title: "العد حتى خمسة", status: "in_review",
  content: {
    introduction: "لنعدّ النجوم معاً.",
    explanation: [
      { text: "نجمة واحدة. لنقل معاً: واحد.", visual: em("⭐") },
      { text: "نجمتان. المس كل نجمة وقل: واحد، اثنان.", visual: em("⭐⭐") },
      { text: "ثلاث نجوم. واحد، اثنان، ثلاثة.", visual: em("⭐⭐⭐") },
    ],
    recap: "اليوم تدرّبنا على العدّ حتى خمسة.",
  },
  objectives: [{ code: "CNT-AR-1", description: "عدّ مجموعة من واحد إلى خمسة أشياء، واحداً تلو الآخر.", skill: "counting-1-5" }],
  activities: [
    { objective: "CNT-AR-1", skill: "counting-1-5", spec: count("guided", "كم عدد النجوم؟", "⭐", 2, [1, 2, 3], ["المس كل نجمة وعدّها."], "هناك نجمتان.") },
    { objective: "CNT-AR-1", skill: "counting-1-5", spec: count("independent", "كم عدد النجوم؟", "⭐", 3, [2, 3, 4], ["عدّها واحدة واحدة."], "هناك ثلاث نجوم.") },
  ],
};

export const SEED_LESSONS: SeedLesson[] = [colours, shapes, countLesson, soundS, countFr, countAr];

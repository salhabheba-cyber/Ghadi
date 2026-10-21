/** Representative texts for the extraction, quality and generation regression tests. */

/** A clean maths worksheet as a good extractor should produce it. */
export const MATH_WORKSHEET = [
  "--- Page 1 ---",
  "## Algebra and number practice",
  "1. Simplify 3/4 + 2/3.",
  "2. Solve 2x + 5 = 17 for x.",
  "3. Evaluate 2^3 × 5^2.",
  "4. A circle has radius 4.5 cm. Find its area using π = 3.14.",
  "5. Write 0.00045 in scientific notation.",
  "--- Page 2 ---",
  "6. Factorise x^2 − 9.",
  "7. A car travels 150 km in 2.5 h. Calculate its average speed in km/h.",
].join("\n");

/** What the old extractor produced: questions glued to page furniture, a site name and a number glued to a word. */
export const MERGED_QUESTIONS = [
  "www.mathsworksheets.com Worksheet 3",
  "24. Simplify 3/4 + 2/3? 25. Solve 2x + 5 = 17.",
  "26. Find the area of a circle with radius 4.5 cm. 27. What is 2^3 × 5^2?",
  "28. Factorise x^2 − 9? 29. Write 0.00045 in scientific notation.",
  "30. Calculate 150 km ÷ 2.5 h.",
].join("\n");

/** Typical OCR garbage from a blurry photo. */
export const OCR_NOISE = [
  "l|1 ~~ ;; ¬¬ ﬁ ¤¤ xq zv",
  "Û§ ¶¶ ||| ·· ¿¿ ÷÷ ‰‰",
  "tj kx qz vw pr bn mm zz",
  "ÃÂÃ¢Â€Â™ â€œ â€ Ã© Ã¨",
  "|| ~~ ## @@ ^^ && ** %% $$",
].join("\n");

/** Legitimate non-English text and scientific notation must pass. */
export const FRENCH_SCIENCE = [
  "La vitesse de la lumière dans le vide est d'environ 3,00 × 10^8 m/s.",
  "L'énergie cinétique se calcule avec la formule E = 1/2 m v^2, où m est la masse en kg.",
  "Un électron a une charge de −1,6 × 10^−19 C et une masse de 9,11 × 10^−31 kg.",
  "Les unités du système international permettent de comparer des mesures dans le monde entier.",
].join("\n");

export const ARABIC_TEXT = [
  "التمثيل الضوئي هو العملية التي تحول بها النباتات ضوء الشمس إلى طاقة كيميائية.",
  "تحدث هذه العملية في البلاستيدات الخضراء التي تحتوي على الكلوروفيل.",
  "يمتص الكلوروفيل الضوء الأحمر والأزرق ويعكس الضوء الأخضر.",
].join("\n");

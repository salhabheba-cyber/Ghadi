# Book sources

Every book in Ghadi is stored inside Ghadi (`public/books/<slug>.json`, images in `public/books/img`). Students never leave the app and nothing is fetched from a third party while reading. Each catalog entry records title, author, language, age band, source URL, licence and attribution; `tests/unit/read-strings.test.ts` fails if a book lacks a licence or source.

## What is in the catalog (241 books, about 3.45 million words)

| Source                                                                               | Languages                        | Books | Licence                           |
| ------------------------------------------------------------------------------------ | -------------------------------- | ----- | --------------------------------- |
| Global Storybooks / African Storybook (children's picture books)                     | English 90, French 75, Arabic 24 | 189   | CC BY 3.0 (151) or CC BY 4.0 (38) |
| [Standard Ebooks](https://standardebooks.org) (public-domain novels, careful markup) | English                          | 25    | Public domain (US); markup CC0    |
| Project Gutenberg French titles via the GITenberg mirror                             | French                           | 27    | Public domain (US)                |

Licence totals: CC BY 3.0 x151, CC BY 4.0 x38, PD-US x27, PD-US plus CC0 markup x25. CC BY books show their attribution in the book page and the reader.

## Coverage by age band (English / French / Arabic)

| Age   | en  | fr  | ar  |
| ----- | --- | --- | --- |
| 3-5   | 37  | 29  | 11  |
| 6-8   | 85  | 79  | 18  |
| 9-11  | 72  | 62  | 13  |
| 12-14 | 21  | 19  | 0   |
| 15-18 | 11  | 13  | 0   |

## Honest gaps

- **Arabic covers picture books only (24 titles, ages 3-11).** There are no Arabic books for ages 12-18 yet. Adding them needs a source with an open licence (candidates to evaluate: Hindawi, whose licence terms must be checked per title; school-contributed material).
- StoryWeaver and Open Library were evaluated but are not integrated (licence per title varies, or the files are not redistributable).
- Books are converted to Ghadi's own JSON format. There is no EPUB/PDF reader and no teacher or parent upload.
- Older-age English and French collections are classics; they are real books, not graded readers.

## Rebuilding the catalog

`scripts/build-catalog-*.mjs` fetch and convert each source into `public/books` and the manifests under `src/lib/books`. They need network access to the sources (not available in the sandbox where the repository was prepared; the generated files are committed). The seed (`src/lib/server/books/seed.ts`) upserts catalog rows at server start and never deletes student data.

// Loads the personal gift config (js/gifts.js, git-ignored) if present,
// otherwise falls back to the public example (js/gifts.example.js).
let mod;
try {
  mod = await import("./gifts.js");
} catch {
  mod = await import("./gifts.example.js");
}

export const { GIFT_GALLERY_ITEMS, LETTER_CONTENT, BIRTHDAY, MAILBOX_LETTERS, ANIMAL_BLESSINGS, fillBirthdayText } = mod;

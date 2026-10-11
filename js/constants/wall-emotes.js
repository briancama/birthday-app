// GIFs live in /images/emotes/: transparent, about 19px tall, <= ~48px wide. First entry is the picker icon.
const emote = (key, file, label, aliases = [], width = 19) => ({
  key,
  src: `/images/emotes/${file}`,
  label,
  width,
  height: 19,
  aliases,
});

export const WALL_EMOTES = [
  emote("smile", "regular_smile.gif", "Smile", [":)", ":-)"]),
  emote("grin", "teeth_smile.gif", "Grin", [":D", ":-D", ":d"]),
  emote("wink", "wink_smile.gif", "Wink", [";)", ";-)"]),
  emote("tongue", "tongue_smile.gif", "Tongue out", [":P", ":-P", ":p"]),
  emote("omg", "omg_smile.gif", "Surprised", [":O", ":-O", ":o"]),
  emote("sad", "sad_smile.gif", "Sad", [":(", ":-("]),
  emote("cry", "cry_smile.gif", "Crying", [":'("]),
  emote("confused", "confused_smile.gif", "Confused", [":S", ":-S", ":s"]),
  emote("meh", "what_smile.gif", "Disappointed", [":|", ":-|"]),
  emote("blush", "red_smile.gif", "Embarrassed", [":$", ":-$"]),
  emote("angry", "angry_smile.gif", "Angry", [":@", ":-@"]),
  emote("cool", "shades_smile.gif", "Cool"),
  emote("angel", "angel_smile.gif", "Angel"),
  emote("devil", "devil_smile.gif", "Devil"),
  emote("party", "party_smile.gif", "Party"),
  emote("cake", "cake.gif", "Birthday cake", [], 17),
  emote("heart", "heart.gif", "Heart", ["<3"]),
  emote("broken-heart", "broken_heart.gif", "Broken heart", ["</3"]),
  emote("thumbs-up", "thumbs_up.gif", "Thumbs up"),
  emote("thumbs-down", "thumbs_down.gif", "Thumbs down"),
  emote("girl-hug", "girl_hug.gif", "Girl hug"),
  emote("guy-hug", "guy_hug.gif", "Guy hug"),
  emote("bat", "bat.gif", "Vampire bat", [":[", ":-["]),
  emote("sheep", "black_sheep.gif", "Black sheep"),
];

export const MAX_EMOTES_PER_COMMENT = 12;

export const EMOTES_BY_KEY = new Map(WALL_EMOTES.map((e) => [e.key, e]));

export const EMOTES_BY_ALIAS = new Map(
  WALL_EMOTES.flatMap((e) => (e.aliases || []).map((alias) => [alias, e]))
);

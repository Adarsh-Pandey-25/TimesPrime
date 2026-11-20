import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { isAllowedHref, StoryImage } from "./schema";

/**
 * A live blog's update (Panel 3 design §2, M3) is written in a smaller schema than a story's. Its
 * rules, checked before an update is stored and again before readers see it, are in
 * packages/shared/src/lib/liveBody.ts (re-exported here); these are the editor's extensions for it.
 */
export { LIVE_BLOCKS_MAX, LIVE_IMAGES_MAX, LIVE_TEXT_MAX, liveBodyProblem } from "@timesprime/shared/lib/liveBody";

/**
 * The editor's extensions for an update: a story's, without headings, lists, quotes, code, rules,
 * strike, underline, embeds, galleries or ad slots. What it can make, liveBodyProblem accepts.
 */
export function liveExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      listKeymap: false,
      blockquote: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      strike: false,
      underline: false,
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        isAllowedUri: (url) => isAllowedHref(url),
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: null },
      },
    }),
    StoryImage,
  ];
}

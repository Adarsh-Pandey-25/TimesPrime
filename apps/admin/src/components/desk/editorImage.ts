import type { Extensions } from "@tiptap/core";
import { StoryImage, storyExtensions } from "@timesprime/editor/schema";
import { MEDIA_ID } from "@timesprime/shared/config/media";

// The Desk editor's view of an image node (Panel 2 design §5 and §7): the picture itself, loaded
// through the back office (the original, for staff), and a line saying which crop readers get and
// where its words come from. The stored node is the schema's: only the image's id and its crop.

const RATIO_LABELS: Record<string, string> = { "16x9": "16:9", "4x3": "4:3", "1x1": "square" };

export const EditorImage = StoryImage.extend({
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("figure");
      dom.setAttribute("data-type", "image");
      dom.contentEditable = "false";
      dom.style.margin = "1rem 0";
      const id = typeof node.attrs.id === "string" && MEDIA_ID.test(node.attrs.id) ? node.attrs.id : "";
      if (id) {
        const img = document.createElement("img");
        img.src = `/api/admin/desk/media/${id}/original`;
        img.alt = "";
        img.loading = "lazy";
        img.style.maxHeight = "16rem";
        img.style.maxWidth = "100%";
        img.style.borderRadius = "0.375rem";
        dom.appendChild(img);
      }
      const note = document.createElement("figcaption");
      note.style.fontSize = "0.75rem";
      note.style.opacity = "0.7";
      const ratio = RATIO_LABELS[String(node.attrs.ratio)] ?? "16:9";
      note.textContent = id
        ? `Image, ${ratio} crop. Its alt text, caption and credit come from the media library, in the story's language.`
        : "An image the library does not have: remove it.";
      dom.appendChild(note);
      return { dom };
    };
  },
});

/** The story schema, with the editor's view of an image. */
export function editorExtensions(): Extensions {
  return storyExtensions().map((extension) => (extension.name === "image" ? EditorImage : extension));
}

// "Copy for WhatsApp" (Panel 3, M1; design §6, moved into M1 by the owner on 19 Nov 2026). A ready
// message for the WhatsApp Channel, posted by hand: the headline in bold (WhatsApp's *…*), the dek,
// and the story's address tagged so analytics can tell WhatsApp's readers apart (research:
// "a 'copy for WhatsApp' button that builds the headline, a line of text and a UTM link"). In the
// story's own language, because the headline and dek are. Nothing is stored or sent.

export const WHATSAPP_UTM = { utm_source: "whatsapp", utm_medium: "social", utm_campaign: "channel" } as const;

export function whatsAppMessage(story: { headline: string; dek: string | null; url: string }): string {
  const address = new URL(story.url);
  for (const [key, value] of Object.entries(WHATSAPP_UTM)) address.searchParams.set(key, value);
  // WhatsApp bolds *text*; a headline's own asterisks would end the bold early.
  const headline = story.headline.replace(/\*/g, "").trim();
  const dek = (story.dek ?? "").trim();
  return [`*${headline}*`, dek, address.toString()].filter(Boolean).join("\n");
}

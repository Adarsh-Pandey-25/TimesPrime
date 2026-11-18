import { ROLE_KEYS, type RoleKey } from "../config/permissions";

/**
 * The staff roles as people read them, for the back office's top bar: who is signed in, and as what
 * (the owner asked, 18 Nov 2026: "which one is the Writer, which the admin?").
 */
export const ROLE_LABELS: Record<RoleKey, string> = {
  super_admin: "Super Admin",
  managing_editor: "Managing Editor",
  desk_editor: "Desk Editor",
  sub_editor: "Sub-editor",
  writer: "Writer",
  ingestion_ops: "Ingestion Ops",
  analyst: "Analyst",
  grievance_officer: "Grievance Officer",
  legal_compliance: "Legal",
  privacy_officer: "Privacy Officer",
  security_lead: "Security Lead",
  crm_mgr: "CRM Manager",
  support: "Support",
  brand_studio: "Brand Studio",
  ad_ops: "Ad Ops",
};

const LANGUAGES: Record<string, string> = { en: "English", hi: "Hindi" };

/**
 * A person's live roles in one line, in the catalogue's order, each once, with the desks it covers:
 * "Super Admin · Desk Editor (English, Hindi)". A section narrows a desk: "Writer (English sports)".
 */
export function describeRoles(roles: ReadonlyArray<{ role: string; language: string | null; section: string | null }>): string {
  const desks = new Map<string, string[]>();
  for (const { role, language, section } of roles) {
    const list = desks.get(role) ?? [];
    const desk = [language ? (LANGUAGES[language] ?? language) : null, section].filter(Boolean).join(" ");
    if (desk && !list.includes(desk)) list.push(desk);
    desks.set(role, list);
  }
  const order = (role: string) => {
    const at = (ROLE_KEYS as readonly string[]).indexOf(role);
    return at === -1 ? ROLE_KEYS.length : at;
  };
  return [...desks.keys()]
    .sort((a, b) => order(a) - order(b))
    .map((role) => {
      const label = ROLE_LABELS[role as RoleKey] ?? role.replace(/_/g, " ");
      const list = desks.get(role) ?? [];
      return list.length > 0 ? `${label} (${list.join(", ")})` : label;
    })
    .join(" · ");
}

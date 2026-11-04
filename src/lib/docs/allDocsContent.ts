import type { DocPageContent } from "./content/sectionA";
import { SECTION_A_PAGES } from "./content/sectionA";
import { SECTION_B_PAGES } from "./content/sectionB";
import { SECTION_C_PAGES } from "./content/sectionC";
import { SECTION_D_PAGES } from "./content/sectionD";
import { SECTION_E_PAGES } from "./content/sectionE";
import { SECTION_F_PAGES } from "./content/sectionF";
import { SECTION_G_PAGES } from "./content/sectionG";
import { SECTION_H_PAGES } from "./content/sectionH";

export const ALL_DOCS_CONTENT: Record<string, DocPageContent> = {
  ...SECTION_A_PAGES,
  ...SECTION_B_PAGES,
  ...SECTION_C_PAGES,
  ...SECTION_D_PAGES,
  ...SECTION_E_PAGES,
  ...SECTION_F_PAGES,
  ...SECTION_G_PAGES,
  ...SECTION_H_PAGES,
};

export function getDocContentBySlug(slug: string | string[]): DocPageContent | undefined {
  const normalized = Array.isArray(slug) ? slug.join("/") : slug;
  return ALL_DOCS_CONTENT[normalized];
}


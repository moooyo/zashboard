export const cloneWholeDocument = <Document>(document: Document): Document =>
  JSON.parse(JSON.stringify(document)) as Document

export const wholeDocumentChanged = <Document>(
  base: Document | null,
  draft: Document | null,
) => {
  if (!base || !draft) return base !== draft
  return JSON.stringify(base) !== JSON.stringify(draft)
}

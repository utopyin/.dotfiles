import {
  compile as compileHtmlToText,
  convert as convertHtmlToText,
} from "html-to-text";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
// turndown-plugin-gfm does not ship ESM-friendly typings.
import { gfm } from "turndown-plugin-gfm";

const REMOVAL_SELECTOR = [
  "head",
  "title",
  "script",
  "style",
  "noscript",
  "template",
  "meta",
  "link",
  "iframe",
  "object",
  "embed",
  "canvas",
  "svg",
  "video",
  "audio",
  "source",
  "picture",
  "button",
  "input",
  "select",
  "textarea",
].join(", ");

const LANDMARK_REMOVAL_SELECTOR = [
  "header",
  "footer",
  "nav",
  "aside",
  "dialog",
  "menu",
  "[role='banner']",
  "[role='navigation']",
  "[role='complementary']",
  "[role='contentinfo']",
  "[aria-modal='true']",
  "[hidden]",
  "[aria-hidden='true']",
].join(", ");

const PREFERRED_CONTENT_SELECTORS = [
  "#readme",
  "[data-testid='repository-readme-content']",
  "article.markdown-body",
  ".markdown-body",
  "#bigbox",
  "article",
  "main",
  "[role='main']",
  "#content",
  "#main-content",
  ".main-content",
  ".content",
  ".post-content",
  ".entry-content",
  ".article-content",
  ".story-list",
  ".story",
];

const BOILERPLATE_TOKEN_RE =
  /(^|[-_\s])(nav(?:igation)?|header|footer|sidebar|aside|menu|dialog|modal|cookie|consent|promo|advert|social|share|breadcrumb|pagination|pager|toolbar|search|newsletter|subscribe|signup|login|banner|related|recommendation)s?($|[-_\s])/iu;
const RAW_HTML_BLOCK_TAG_RE =
  /<(article|aside|div|footer|header|main|nav|section|table|tbody|td|tfoot|th|thead|tr)\b/giu;
const UNSAFE_SCRIPT_PROTOCOL = ["java", "script:"].join("");
const UNSAFE_VBSCRIPT_PROTOCOL = "vbscript:";

const createTurndownService = (): TurndownService => {
  const service = new TurndownService({
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    headingStyle: "atx",
    hr: "---",
  });
  service.use(gfm as never);
  return service;
};

const turndown = createTurndownService();
const compiledHtmlToText = compileHtmlToText({
  baseElements: {
    returnDomByDefault: true,
    selectors: ["body", "main", "article", "div"],
  },
  selectors: [
    { format: "skip", selector: "img" },
    {
      format: "dataTable",
      options: { uppercaseHeaderCells: false },
      selector: "table",
    },
    { options: { uppercase: false }, selector: "h1" },
    { options: { uppercase: false }, selector: "h2" },
    { options: { uppercase: false }, selector: "h3" },
    { options: { uppercase: false }, selector: "h4" },
    { options: { uppercase: false }, selector: "h5" },
    { options: { uppercase: false }, selector: "h6" },
  ],
  wordwrap: false,
});

export const sanitizeHtml = (rawHtml: string, baseUrl: string): string => {
  const { document } = parseHTML(rawHtml);
  const root = extractReadableRoot(document);

  removeMatchingElements(root, REMOVAL_SELECTOR);
  removeMatchingElements(root, LANDMARK_REMOVAL_SELECTOR);
  removeBoilerplateElements(root);
  flattenLayoutTables(root);
  normalizeBlockLinks(root);
  removeEmptyContainers(root);
  resolveElementUrls(root, baseUrl);

  return `<div>${root.innerHTML}</div>`;
};

export const htmlToMarkdown = (rawHtml: string, baseUrl: string): string => {
  const sanitizedHtml = sanitizeHtml(rawHtml, baseUrl);
  const markdown = turndown.turndown(sanitizedHtml);
  return cleanupMarkdown(markdown);
};

export const htmlToText = (rawHtml: string, baseUrl: string): string => {
  const sanitizedHtml = sanitizeHtml(rawHtml, baseUrl);
  const text = compiledHtmlToText(sanitizedHtml);
  return cleanupText(text);
};

export const htmlToTextFallback = (rawHtml: string): string =>
  cleanupText(convertHtmlToText(rawHtml, { wordwrap: false }));

export const isPoorMarkdownConversion = (markdown: string): boolean => {
  const rawBlockTags = markdown.match(RAW_HTML_BLOCK_TAG_RE)?.length ?? 0;
  if (rawBlockTags >= 6) {
    return true;
  }
  return /^\s*<(article|div|main|section|table|tbody|td|tfoot|th|thead|tr)\b/iu.test(
    markdown
  );
};

const extractReadableRoot = (document: Document): Element => {
  for (const selector of PREFERRED_CONTENT_SELECTORS) {
    const match = pickBestCandidate([...document.querySelectorAll(selector)]);
    if (match) {
      return cloneElement(match);
    }
  }

  const body = document.querySelector("body") ?? document.documentElement;
  const fallbackCandidates = [
    ...body.querySelectorAll("article, main, section, div"),
    body,
  ];
  return cloneElement(pickBestCandidate(fallbackCandidates) ?? body);
};

const pickBestCandidate = (elements: Element[]): Element | undefined => {
  let best: Element | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const element of elements) {
    const score = scoreContentCandidate(element);
    if (score > bestScore) {
      best = element;
      bestScore = score;
    }
  }

  return best;
};

const scoreContentCandidate = (element: Element): number => {
  const textLength = getNormalizedText(element).length;
  if (textLength === 0) {
    return Number.NEGATIVE_INFINITY;
  }

  const linkTextLength = [...element.querySelectorAll("a")]
    .map((link) => getNormalizedText(link).length)
    .reduce((total, value) => total + value, 0);
  const headingCount = element.querySelectorAll(
    "h1, h2, h3, h4, h5, h6"
  ).length;
  const linkDensity = linkTextLength / textLength;
  const listItemCount = element.querySelectorAll("li").length;
  const ownPenalty = isBoilerplateElement(element) ? 800 : 0;
  const paragraphCount = element.querySelectorAll("p").length;
  const tableCount = element.querySelectorAll("table").length;

  let score = textLength;
  score -= linkDensity * 500;
  score += paragraphCount * 120;
  score += listItemCount * 45;
  score += headingCount * 80;
  score -= tableCount * 15;
  score -= ownPenalty;

  if (
    matchesAnySelector(
      element,
      "#readme, [data-testid='repository-readme-content'], article.markdown-body, .markdown-body"
    )
  ) {
    score += 1500;
  }
  if (
    matchesAnySelector(
      element,
      "article, main, [role='main'], #content, #main-content, .main-content"
    )
  ) {
    score += 500;
  }
  if (element.id === "bigbox") {
    score += 1000;
  }

  return score;
};

const removeMatchingElements = (root: Element, selector: string): void => {
  for (const element of root.querySelectorAll(selector)) {
    element.remove();
  }
};

const removeBoilerplateElements = (root: Element): void => {
  for (const element of root.querySelectorAll("*")) {
    if (isBoilerplateElement(element)) {
      element.remove();
    }
  }
};

const flattenLayoutTables = (root: Element): void => {
  const tables = [...root.querySelectorAll("table")];
  for (const table of tables.toReversed()) {
    if (isLikelyLayoutTable(table)) {
      for (const child of [
        ...table.querySelectorAll("thead, tbody, tfoot, tr, td, th"),
      ].toReversed()) {
        replaceTag(child, "div");
      }
      replaceTag(table, "div");
    }
  }
};

const isLikelyLayoutTable = (table: Element): boolean => {
  if (table.querySelector("caption, thead, th")) {
    return false;
  }
  if (
    table.getAttribute("role") === "table" ||
    table.getAttribute("role") === "grid"
  ) {
    return false;
  }
  if (
    matchesAnySelector(table, "#hnmain table, #bigbox table") ||
    table.closest("#hnmain, #bigbox")
  ) {
    return true;
  }
  if (table.querySelector("table")) {
    return true;
  }
  if (
    ["align", "bgcolor", "border", "cellpadding", "cellspacing", "width"].some(
      (attribute) => table.hasAttribute(attribute)
    )
  ) {
    return true;
  }

  const rows = [...table.querySelectorAll("tr")].filter(
    (row) => row.closest("table") === table
  );
  if (rows.length === 0) {
    return true;
  }

  const cellCounts = rows
    .map(
      (row) =>
        [...row.children].filter((child) => child.matches("td, th")).length
    )
    .filter((count) => count > 0);
  if (cellCounts.length === 0) {
    return true;
  }
  if (Math.max(...cellCounts) <= 1) {
    return true;
  }
  if (new Set(cellCounts).size > 1) {
    return true;
  }

  return isSparseLinkTable(table, rows);
};

const isSparseLinkTable = (table: Element, rows: Element[]): boolean => {
  const cells = rows.flatMap((row) =>
    [...row.children].filter((child) => child.matches("td, th"))
  );
  const averageCellTextLength =
    cells.reduce((total, cell) => total + getNormalizedText(cell).length, 0) /
    Math.max(1, cells.length);
  const linkCount = [...table.querySelectorAll("a")].filter(
    (link) => link.closest("table") === table
  ).length;
  return linkCount > cells.length * 0.6 && averageCellTextLength < 120;
};

const normalizeBlockLinks = (root: Element): void => {
  for (const link of root.querySelectorAll("a[href]")) {
    const elementChildren = [...link.children];
    if (elementChildren.length !== 1) {
      continue;
    }
    const [onlyChild] = elementChildren;
    if (onlyChild?.matches("h1, h2, h3, h4, h5, h6")) {
      normalizeHeadingLink(link, onlyChild);
    }
  }
};

const normalizeHeadingLink = (link: Element, onlyChild: Element): void => {
  const replacementLink = link.ownerDocument.createElement("a");
  for (const attribute of ["href", "title"] as const) {
    const value = link.getAttribute(attribute);
    if (value) {
      replacementLink.setAttribute(attribute, value);
    }
  }
  while (onlyChild.firstChild) {
    replacementLink.append(onlyChild.firstChild);
  }
  onlyChild.append(replacementLink);
  link.replaceWith(onlyChild);
};

const removeEmptyContainers = (root: Element): void => {
  for (const element of [
    ...root.querySelectorAll("div, section, article, main, span"),
  ].toReversed()) {
    if (element.children.length > 0) {
      continue;
    }
    if (getNormalizedText(element).length > 0) {
      continue;
    }
    element.remove();
  }
};

const isBoilerplateElement = (element: Element): boolean => {
  const tokens = [
    element.id,
    element.getAttribute("class"),
    element.getAttribute("role"),
    element.getAttribute("aria-label"),
  ]
    .filter(
      (token): token is string => typeof token === "string" && token.length > 0
    )
    .join(" ");
  return BOILERPLATE_TOKEN_RE.test(tokens);
};

const matchesAnySelector = (element: Element, selector: string): boolean => {
  try {
    return element.matches(selector);
  } catch {
    return false;
  }
};

const getNormalizedText = (element: Element): string =>
  element.textContent?.replaceAll(/\s+/gu, " ").trim() ?? "";

const cloneElement = (element: Element): Element =>
  element.cloneNode(true) as Element;

const replaceTag = (element: Element, tagName: string): Element => {
  const replacement = element.ownerDocument.createElement(tagName);
  while (element.firstChild) {
    replacement.append(element.firstChild);
  }
  element.replaceWith(replacement);
  return replacement;
};

const resolveElementUrls = (root: Element, baseUrl: string): void => {
  for (const element of root.querySelectorAll(
    "[href], [src], [poster], [srcset]"
  )) {
    resolveSimpleUrlAttributes(element, baseUrl);
    resolveSrcSetAttribute(element, baseUrl);
  }
};

const resolveSimpleUrlAttributes = (
  element: Element,
  baseUrl: string
): void => {
  for (const attribute of ["href", "src", "poster"] as const) {
    const value = element.getAttribute(attribute);
    if (value === null || value.length === 0) {
      continue;
    }
    const resolved = resolveAttributeUrl(
      value,
      baseUrl,
      attribute === "src" || attribute === "poster"
    );
    if (resolved) {
      element.setAttribute(attribute, resolved);
    } else {
      element.removeAttribute(attribute);
    }
  }
};

const resolveSrcSetAttribute = (element: Element, baseUrl: string): void => {
  const srcset = element.getAttribute("srcset");
  if (srcset) {
    const resolved = resolveSrcSet(srcset, baseUrl);
    if (resolved) {
      element.setAttribute("srcset", resolved);
    } else {
      element.removeAttribute("srcset");
    }
  }
};

const resolveAttributeUrl = (
  value: string,
  baseUrl: string,
  allowDataUrl: boolean
): string | undefined => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return;
  }
  try {
    const resolved = new URL(trimmed, baseUrl);
    if (isUnsafeProtocol(resolved.protocol)) {
      return;
    }
    if (resolved.protocol === "data:" && !allowDataUrl) {
      return;
    }
    return resolved.toString();
  } catch (error) {
    void error;
  }
};

const isUnsafeProtocol = (protocol: string): boolean =>
  protocol === UNSAFE_SCRIPT_PROTOCOL || protocol === UNSAFE_VBSCRIPT_PROTOCOL;

const resolveSrcSet = (srcset: string, baseUrl: string): string | undefined => {
  const candidates = srcset
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => resolveSrcSetEntry(entry, baseUrl))
    .filter((entry): entry is string => typeof entry === "string");
  return candidates.length > 0 ? candidates.join(", ") : undefined;
};

const resolveSrcSetEntry = (
  entry: string,
  baseUrl: string
): string | undefined => {
  const [urlPart, descriptor] = entry.split(/\s+/u, 2);
  if (urlPart === undefined) {
    return;
  }
  const resolved = resolveAttributeUrl(urlPart, baseUrl, true);
  if (resolved) {
    return descriptor ? `${resolved} ${descriptor}` : resolved;
  }
};

const cleanupMarkdown = (markdown: string): string =>
  markdown
    .replaceAll("\r\n", "\n")
    .replaceAll(
      /\[\s*\n+(#{1,6})\s+([^\n]+?)\s*\n+\s*\]\(([^)]+)\)/gu,
      (_match, hashes: string, text: string, url: string) =>
        `${hashes} [${text.trim()}](${url})`
    )
    .replaceAll(/^\[\]\([^)]+\)\n?/gmu, "")
    .replaceAll(/(\]\([^)]+\))(?=\[)/gu, "$1 ")
    .replaceAll(/[ \t]+\n/gu, "\n")
    .replaceAll(/\n{3,}/gu, "\n\n")
    .trim();

const cleanupText = (text: string): string =>
  text
    .replaceAll("\r\n", "\n")
    .replaceAll(/[ \t]+\n/gu, "\n")
    .replaceAll(/\n{3,}/gu, "\n\n")
    .trim();

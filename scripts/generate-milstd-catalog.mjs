import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const sourceDir = path.join(
  repoRoot,
  ".cache",
  "joint-military-symbology-xml",
  "samples",
  "imagefile_name_category_tags",
);
const targetDir = path.join(repoRoot, "generated");
const targetPath = path.join(targetDir, "milstd-symbol-catalog.js");

const AFFILIATION_VARIANTS = new Map([
  ["0", "unknown"],
  ["1", "friendly"],
  ["2", "neutral"],
  ["3", "hostile"],
]);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.length)) rows.push(row);
  return rows;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "symbol";
}

function convertGraphicPath(filePath) {
  return String(filePath || "")
    .replace(/^\{Symbols_Root\}[\\/]/, ".cache/joint-military-symbology-xml/svg/")
    .replace(/\\/g, "/")
    .replace(/\.emf$/i, ".svg");
}

function detectFamily(relativePath = "", styleCategory = "") {
  const combined = `${relativePath} ${styleCategory}`.toLowerCase();
  if (combined.includes("/appendices/controlmeasures/")) return { key: "control_measures", label: "Control Measures", domain: "ground" };
  if (combined.includes("/appendices/metoc/atmospheric/")) return { key: "metoc_atmospheric", label: "METOC Atmospheric", domain: "ground" };
  if (combined.includes("/appendices/metoc/oceanographic/")) return { key: "metoc_oceanographic", label: "METOC Oceanographic", domain: "sea_surface" };
  if (combined.includes("/appendices/metoc/space/")) return { key: "metoc_space", label: "METOC Space", domain: "space" };
  if (combined.includes("/appendices/activities/")) return { key: "activities", label: "Activities", domain: "ground" };
  if (combined.includes("/appendices/cyberspace/")) return { key: "cyberspace", label: "Cyberspace", domain: "ground" };
  if (combined.includes("/appendices/sigint/")) return { key: "sigint", label: "SIGINT", domain: "ground" };
  if (combined.includes("/appendices/air/")) return { key: "air", label: "Air", domain: "air" };
  if (combined.includes("/appendices/land/")) return { key: "land", label: "Land", domain: "ground" };
  if (combined.includes("/appendices/seasurface/")) return { key: "sea_surface", label: "Sea Surface", domain: "sea_surface" };
  if (combined.includes("/appendices/seasubsurface/")) return { key: "sea_subsurface", label: "Sea Subsurface", domain: "subsurface" };
  if (combined.includes("/appendices/space/")) return { key: "space", label: "Space", domain: "space" };
  return { key: "other", label: "Other", domain: "ground" };
}

function normalizeLabel(label, variantAffiliation) {
  const value = String(label || "").trim();
  if (!variantAffiliation) return value;
  const suffix = new RegExp(`\\s*:\\s*${variantAffiliation.charAt(0).toUpperCase()}${variantAffiliation.slice(1)}\\s*$`);
  return value.replace(suffix, "").trim();
}

function detectObjectClass(legacySidc = "", familyKey = "") {
  if (legacySidc.startsWith("S")) return "unit";
  if (legacySidc.startsWith("G") || familyKey === "control_measures") return "marker";
  if (legacySidc.startsWith("W") || familyKey.startsWith("metoc")) return "marker";
  return "unit";
}

function buildCatalog() {
  const files = fs.readdirSync(sourceDir)
    .filter((name) => name.toLowerCase().endsWith(".csv"))
    .filter((name) => /icons|points/i.test(name))
    .filter((name) => !/frame-and-amplifier/i.test(name))
    .sort();

  const entries = new Map();

  for (const fileName of files) {
    const text = fs.readFileSync(path.join(sourceDir, fileName), "utf8");
    const rows = parseCsv(text);
    if (rows.length < 2) continue;
    const headers = rows[0];
    const headerIndex = new Map(headers.map((header, index) => [header, index]));
    for (const row of rows.slice(1)) {
      const geometryType = row[headerIndex.get("styleItemGeometryType")] || "";
      if (geometryType !== "Point") continue;

      const uniqueId = String(row[headerIndex.get("styleItemUniqueId")] || "").trim();
      const styleItemName = String(row[headerIndex.get("styleItemName")] || "").trim();
      const styleItemCategory = String(row[headerIndex.get("styleItemCategory")] || "").trim();
      const styleItemTags = String(row[headerIndex.get("styleItemTags")] || "").trim();
      const filePath = String(row[headerIndex.get("filePath")] || "").trim();
      if (!uniqueId || !styleItemName || !filePath) continue;

      const svgPath = convertGraphicPath(filePath);
      const variantMatch = svgPath.match(/_(\d)\.svg$/i);
      const variantAffiliation = AFFILIATION_VARIANTS.get(variantMatch?.[1] || "");
      const family = detectFamily(svgPath, styleItemCategory);
      const tags = styleItemTags.split(";").map((value) => value.trim()).filter(Boolean);
      const legacySidc = tags.find((value) => /^[A-Z\*][A-Z0-9\-\*]{14}$/.test(value)) || "";
      const label = normalizeLabel(styleItemName, variantAffiliation);

      const existing = entries.get(uniqueId) || {
        id: `${uniqueId}-${slugify(label)}`,
        uniqueId,
        label,
        category: styleItemCategory,
        familyKey: family.key,
        familyLabel: family.label,
        domain: family.domain,
        objectClass: detectObjectClass(legacySidc, family.key),
        legacySidc,
        symbolSetCode: uniqueId.slice(0, 2),
        entityCode: uniqueId.slice(2, 8),
        defaultPath: "",
        variantPaths: {},
        tags: [],
        searchText: "",
      };

      if (!existing.defaultPath && !variantAffiliation) {
        existing.defaultPath = svgPath;
      }
      if (variantAffiliation) {
        existing.variantPaths[variantAffiliation] = svgPath;
        if (!existing.defaultPath && variantAffiliation === "friendly") {
          existing.defaultPath = svgPath;
        }
      }
      if (!existing.legacySidc && legacySidc) existing.legacySidc = legacySidc;
      existing.tags = [...new Set([...existing.tags, ...tags])];
      existing.searchText = [
        existing.label,
        existing.category,
        existing.familyLabel,
        existing.legacySidc,
        ...existing.tags,
      ].join(" ").toLowerCase();
      entries.set(uniqueId, existing);
    }
  }

  return [...entries.values()]
    .filter((entry) => entry.defaultPath || Object.keys(entry.variantPaths).length)
    .sort((a, b) => a.familyLabel.localeCompare(b.familyLabel) || a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
}

const catalog = buildCatalog();
fs.mkdirSync(targetDir, { recursive: true });
const payload = `window.RFSIM_MILSTD_SYMBOL_CATALOG = ${JSON.stringify(catalog, null, 2)};\n`;
fs.writeFileSync(targetPath, payload, "utf8");

console.log(`Generated ${catalog.length} symbol entries -> ${path.relative(repoRoot, targetPath)}`);

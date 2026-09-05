/**
 * TOKEN DISCIPLINE · blueprint §20.3
 *
 * "A hex code, px value, or shadow written inline in a component is a defect —
 *  it means a decision was made outside the system and will drift."
 *
 * This is that rule, enforced. Run: `npm run check:tokens`
 *
 * Scope is .tsx only. The stylesheets are where values are *allowed* to live;
 * components may only reference them.
 *
 * Geometry (width/height/top/left/flex-basis/stroke) is exempt: a 5px dot or a
 * 180px illustration is a dimension, not a design decision the system owns.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SRC = join(ROOT, "src");

const GEOMETRY = /^(width|height|minWidth|maxWidth|minHeight|maxHeight|top|left|right|bottom|flexBasis|size|strokeWidth|zIndex)$/;

const RULES = [
  {
    id: "raw-hex",
    // #fff / #ffffff / #ffffffff, but not inside a URL fragment or a regex
    re: /#[0-9a-fA-F]{3,8}\b/g,
    msg: "raw hex colour — use a token (var(--…))",
  },
  {
    id: "raw-shadow",
    re: /boxShadow:\s*["'`](?!var\()/g,
    msg: "literal box-shadow — use var(--clay-*) or var(--inset-*)",
  },
  {
    id: "raw-spacing",
    // padding: 16 / margin: "24px" / gap: 8 / borderRadius: 12 / fontSize: 14
    re: /\b(padding|paddingTop|paddingBottom|paddingLeft|paddingRight|margin|marginTop|marginBottom|marginLeft|marginRight|gap|rowGap|columnGap|borderRadius|fontSize|letterSpacing)\s*:\s*["'`]?\s*-?\d+(\.\d+)?(px|rem|em)?\s*["'`]?/g,
    msg: "raw spacing/radius/type value — use a token or a t-* class",
  },
];

const ALLOW = /\b(0|2)\b/; // 0 and hairline 2 are not design decisions

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const violations = [];

for (const file of walk(SRC)) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");

  lines.forEach((line, i) => {
    if (line.trimStart().startsWith("*") || line.trimStart().startsWith("//")) return;
    if (line.includes("check-tokens-ignore")) return;

    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(line))) {
        const hit = m[0];
        if (rule.id === "raw-spacing") {
          const prop = hit.split(":")[0].trim();
          if (GEOMETRY.test(prop)) continue;
          const num = hit.match(/-?\d+(\.\d+)?/)?.[0] ?? "";
          if (ALLOW.test(num) && !/\d\d/.test(num)) continue;
        }
        violations.push({
          file: relative(ROOT, file).replace(/\\/g, "/"),
          line: i + 1,
          rule: rule.id,
          hit: hit.trim(),
          msg: rule.msg,
        });
      }
    }
  });
}

if (violations.length) {
  console.error(`\n  ${violations.length} token-discipline violation(s):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}]  ${v.hit}`);
    console.error(`      ${v.msg}\n`);
  }
  process.exit(1);
}

console.log("  token discipline: clean — no raw hex, shadow, spacing or type values in components");

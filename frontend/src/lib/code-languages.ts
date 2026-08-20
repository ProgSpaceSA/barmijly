/**
 * The grammars `rehype-highlight` is allowed to load.
 *
 * highlight.js ships ~190 languages and its "common" bundle still carries
 * ~40 of them. Descriptions in this system quote our own stack, our database,
 * and the odd config file — so the list is written out by hand and everything
 * else falls back to unhighlighted text rather than shipping grammars nobody
 * will ever hit.
 */
import bash from "highlight.js/lib/languages/bash";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

export const CODE_LANGUAGES = {
  bash,
  csharp,
  css,
  diff,
  dockerfile,
  go,
  ini,
  java,
  javascript,
  json,
  markdown,
  php,
  plaintext,
  python,
  sql,
  typescript,
  xml,
};

/** Offered in the editor's code-block picker, in the order shown. */
export const CODE_LANGUAGE_CHOICES = [
  "typescript",
  "javascript",
  "sql",
  "json",
  "bash",
  "csharp",
  "python",
  "java",
  "php",
  "xml",
  "css",
  "yaml",
  "diff",
  "plaintext",
] as const;

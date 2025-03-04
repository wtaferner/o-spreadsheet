//------------------------------------------------------------------------------
// Miscellaneous
//------------------------------------------------------------------------------
import {
  DEFAULT_CELL_HEIGHT,
  DEFAULT_FONT,
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_WEIGHT,
  MIN_CELL_TEXT_MARGIN,
  MIN_CF_ICON_MARGIN,
  NEWLINE,
  PADDING_AUTORESIZE_VERTICAL,
} from "../constants";
import { fontSizeMap } from "../fonts";
import { Cell, ConsecutiveIndexes, Lazy, Style, UID } from "../types";
import { Cloneable, Pixel } from "./../types/misc";
import { parseDateTime } from "./dates";
/**
 * Stringify an object, like JSON.stringify, except that the first level of keys
 * is ordered.
 */
export function stringify(obj: any): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

/**
 * Remove quotes from a quoted string
 * ```js
 * removeStringQuotes('"Hello"')
 * > 'Hello'
 * ```
 */
export function removeStringQuotes(str: string): string {
  if (str[0] === '"') {
    str = str.slice(1);
  }
  if (str[str.length - 1] === '"' && str[str.length - 2] !== "\\") {
    return str.slice(0, str.length - 1);
  }
  return str;
}

function isCloneable<T>(obj: T | Cloneable<T>): obj is Cloneable<T> {
  return "clone" in obj && obj.clone instanceof Function;
}

/**
 * Escapes a string to use as a literal string in a RegExp.
 * @url https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#Escaping
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Deep copy arrays, plain objects and primitive values.
 * Throws an error for other types such as class instances.
 * Sparse arrays remain sparse.
 */
export function deepCopy<T>(obj: T): T {
  const result: any = Array.isArray(obj) ? [] : {};
  switch (typeof obj) {
    case "object": {
      if (obj === null) {
        return obj;
      } else if (isCloneable(obj)) {
        return obj.clone();
      } else if (!(isPlainObject(obj) || obj instanceof Array)) {
        throw new Error("Unsupported type: only objects and arrays are supported");
      }
      for (const key in obj) {
        result[key] = deepCopy(obj[key]);
      }
      return result;
    }
    case "number":
    case "string":
    case "boolean":
    case "function":
    case "undefined":
      return obj;
    default:
      throw new Error(`Unsupported type: ${typeof obj}`);
  }
}

/**
 * Check if the object is a plain old javascript object.
 */
function isPlainObject(obj: unknown): boolean {
  return typeof obj === "object" && obj?.constructor === Object;
}

/**
 * Sanitize the name of a sheet, by eventually removing quotes
 * @param sheetName name of the sheet, potentially quoted with single quotes
 */
export function getUnquotedSheetName(sheetName: string): string {
  if (sheetName.startsWith("'")) {
    sheetName = sheetName.slice(1, -1).replace(/''/g, "'");
  }
  return sheetName;
}

/**
 * Add quotes around the sheet name if it contains at least one non alphanumeric character
 * '\w' captures [0-9][a-z][A-Z] and _.
 * @param sheetName Name of the sheet
 */
export function getComposerSheetName(sheetName: string): string {
  if (sheetName.match(/\w/g)?.length !== sheetName.length) {
    sheetName = `'${sheetName}'`;
  }
  return sheetName;
}

export function clip(val: number, min: number, max: number): number {
  return val < min ? min : val > max ? max : val;
}

export function computeTextLinesHeight(textLineHeight: number, numberOfLines: number = 1) {
  return numberOfLines * (textLineHeight + MIN_CELL_TEXT_MARGIN) - MIN_CELL_TEXT_MARGIN;
}

/**
 * Get the default height of the cell given its style.
 */
export function getDefaultCellHeight(cell: Cell | undefined): Pixel {
  if (!cell || !cell.content) {
    return DEFAULT_CELL_HEIGHT;
  }
  const fontSize = computeTextFontSizeInPixels(cell.style);
  const multiLineText = cell.content.split(NEWLINE);
  return computeTextLinesHeight(fontSize, multiLineText.length) + 2 * PADDING_AUTORESIZE_VERTICAL;
}

export function computeTextWidth(context: CanvasRenderingContext2D, text: string, style: Style) {
  context.save();
  context.font = computeTextFont(style);
  const textWidth = context.measureText(text).width;
  context.restore();
  return textWidth;
}

export function computeTextFont(style: Style): string {
  const italic = style.italic ? "italic " : "";
  const weight = style.bold ? "bold" : DEFAULT_FONT_WEIGHT;
  const size = computeTextFontSizeInPixels(style);
  return `${italic}${weight} ${size}px ${DEFAULT_FONT}`;
}

export function computeTextFontSizeInPixels(style?: Style): number {
  const sizeInPt = style?.fontSize || DEFAULT_FONT_SIZE;
  if (!fontSizeMap[sizeInPt]) {
    throw new Error("Size of the font is not supported");
  }
  return fontSizeMap[sizeInPt];
}

/**
 * Return the font size that makes the width of a text match the given line width.
 * Minimum font size is 1.
 *
 * @param getTextWidth function that takes a fontSize as argument, and return the width of the text with this font size.
 */
export function getFontSizeMatchingWidth(
  lineWidth: number,
  maxFontSize: number,
  getTextWidth: (fontSize: number) => number,
  precision = 0.25
) {
  let minFontSize = 1;
  if (getTextWidth(minFontSize) > lineWidth) return minFontSize;
  if (getTextWidth(maxFontSize) < lineWidth) return maxFontSize;

  // Dichotomic search
  let fontSize = (minFontSize + maxFontSize) / 2;
  let currentTextWidth = getTextWidth(fontSize);

  // Use a maximum number of iterations to be safe, because measuring text isn't 100% precise
  let iterations = 0;
  while (Math.abs(currentTextWidth - lineWidth) > precision && iterations < 20) {
    if (currentTextWidth >= lineWidth) {
      maxFontSize = (minFontSize + maxFontSize) / 2;
    } else {
      minFontSize = (minFontSize + maxFontSize) / 2;
    }
    fontSize = (minFontSize + maxFontSize) / 2;
    currentTextWidth = getTextWidth(fontSize);
    iterations++;
  }
  return fontSize;
}

export function computeIconWidth(style: Style) {
  return computeTextFontSizeInPixels(style) + 2 * MIN_CF_ICON_MARGIN;
}

/**
 * Create a range from start (included) to end (excluded).
 * range(10, 13) => [10, 11, 12]
 * range(2, 8, 2) => [2, 4, 6]
 */
export function range(start: number, end: number, step = 1) {
  if (end <= start && step > 0) {
    return [];
  }
  if (step === 0) {
    throw new Error("range() step must not be zero");
  }
  const length = Math.ceil(Math.abs((end - start) / step));
  const array: number[] = Array(length);
  for (let i = 0; i < length; i++) {
    array[i] = start + i * step;
  }
  return array;
}

/**
 * Groups consecutive numbers.
 * The input array is assumed to be sorted
 * @param numbers
 */
export function groupConsecutive(numbers: number[]): ConsecutiveIndexes[] {
  return numbers.reduce((groups, currentRow, index, rows) => {
    if (Math.abs(currentRow - rows[index - 1]) === 1) {
      const lastGroup = groups[groups.length - 1];
      lastGroup.push(currentRow);
    } else {
      groups.push([currentRow]);
    }
    return groups;
  }, [] as ConsecutiveIndexes[]);
}

/**
 * Create one generator from two generators by linking
 * each item of the first generator to the next item of
 * the second generator.
 *
 * Let's say generator G1 yields A, B, C and generator G2 yields X, Y, Z.
 * The resulting generator of `linkNext(G1, G2)` will yield A', B', C'
 * where `A' = A & {next: Y}`, `B' = B & {next: Z}` and `C' = C & {next: undefined}`
 * @param generator
 * @param nextGenerator
 */
export function* linkNext<T>(
  generator: Generator<T>,
  nextGenerator: Generator<T>
): Generator<T & { next?: T }> {
  nextGenerator.next();
  for (const item of generator) {
    const nextItem = nextGenerator.next();
    yield {
      ...item,
      next: nextItem.done ? undefined : nextItem.value,
    };
  }
}

export function isBoolean(str: string): boolean {
  const upperCased = str.toUpperCase();
  return upperCased === "TRUE" || upperCased === "FALSE";
}

export function isDateTime(str: string): boolean {
  return parseDateTime(str) !== null;
}

const MARKDOWN_LINK_REGEX = /^\[([^\[]+)\]\((.+)\)$/;
//link must start with http or https
//https://stackoverflow.com/a/3809435/4760614
const WEB_LINK_REGEX =
  /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,4}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)$/;

export function isMarkdownLink(str: string): boolean {
  return MARKDOWN_LINK_REGEX.test(str);
}

/**
 * Check if the string is a web link.
 * e.g. http://odoo.com
 */
export function isWebLink(str: string): boolean {
  return WEB_LINK_REGEX.test(str);
}

/**
 * Build a markdown link from a label and an url
 */
export function markdownLink(label: string, url: string): string {
  return `[${label}](${url})`;
}

export function parseMarkdownLink(str: string): { url: string; label: string } {
  const matches = str.match(MARKDOWN_LINK_REGEX) || [];
  const label = matches[1];
  const url = matches[2];
  if (!label || !url) {
    throw new Error(`Could not parse markdown link ${str}.`);
  }
  return {
    label,
    url,
  };
}

const O_SPREADSHEET_LINK_PREFIX = "o-spreadsheet://";

export function isSheetUrl(url: string) {
  return url.startsWith(O_SPREADSHEET_LINK_PREFIX);
}

export function buildSheetLink(sheetId: UID) {
  return `${O_SPREADSHEET_LINK_PREFIX}${sheetId}`;
}

/**
 * Parse a sheet link and return the sheet id
 */
export function parseSheetUrl(sheetLink: string) {
  if (sheetLink.startsWith(O_SPREADSHEET_LINK_PREFIX)) {
    return sheetLink.substr(O_SPREADSHEET_LINK_PREFIX.length);
  }
  throw new Error(`${sheetLink} is not a valid sheet link`);
}

/**
 * This helper function can be used as a type guard when filtering arrays.
 * const foo: number[] = [1, 2, undefined, 4].filter(isDefined)
 */
export function isDefined<T>(argument: T | undefined): argument is T {
  return argument !== undefined;
}

/**
 * Check if all the values of an object, and all the values of the objects inside of it, are undefined.
 */
export function isObjectEmptyRecursive<T extends object>(argument: T | undefined): boolean {
  if (argument === undefined) return true;
  return Object.values(argument).every((value) =>
    typeof value === "object" ? isObjectEmptyRecursive(value) : !value
  );
}

/**
 * Get the id of the given item (its key in the given dictionnary).
 * If the given item does not exist in the dictionary, it creates one with a new id.
 */
export function getItemId<T>(item: T, itemsDic: { [id: number]: T }) {
  for (let [key, value] of Object.entries(itemsDic)) {
    if (stringify(value) === stringify(item)) {
      return parseInt(key, 10);
    }
  }

  // Generate new Id if the item didn't exist in the dictionary
  const ids = Object.keys(itemsDic);
  const maxId = ids.length === 0 ? 0 : Math.max(...ids.map((id) => parseInt(id, 10)));

  itemsDic[maxId + 1] = item;
  return maxId + 1;
}

/**
 * This method comes from owl 1 as it was removed in owl 2
 *
 * Returns a function, that, as long as it continues to be invoked, will not
 * be triggered. The function will be called after it stops being called for
 * N milliseconds. If `immediate` is passed, trigger the function on the
 * leading edge, instead of the trailing.
 *
 * Inspired by https://davidwalsh.name/javascript-debounce-function
 */
export function debounce(func: Function, wait: number, immediate?: boolean): Function {
  let timeout;
  return function (this: any) {
    const context = this;
    const args = arguments;
    function later() {
      timeout = null;
      if (!immediate) {
        func.apply(context, args);
      }
    }
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) {
      func.apply(context, args);
    }
  };
}

/*
 * Concatenate an array of strings.
 */
export function concat(chars: string[]): string {
  // ~40% faster than chars.join("")
  let output = "";
  for (let i = 0, len = chars.length; i < len; i++) {
    output += chars[i];
  }
  return output;
}

/**
 * Lazy value computed by the provided function.
 */
export function lazy<T>(fn: (() => T) | T): Lazy<T> {
  let isMemoized = false;
  let memo: T | undefined;
  const lazyValue = () => {
    if (!isMemoized) {
      memo = fn instanceof Function ? fn() : fn;
      isMemoized = true;
    }
    return memo!;
  };
  lazyValue.map = (callback) => lazy(() => callback(lazyValue()));
  return lazyValue as Lazy<T>;
}

/**
 * Find the next defined value after the given index in an array of strings. If there is no defined value
 * after the index, return the closest defined value before the index. Return an empty string if no
 * defined value was found.
 *
 */
export function findNextDefinedValue(arr: string[], index: number): string {
  let value = arr.slice(index).find((val) => val);
  if (!value) {
    value = arr
      .slice(0, index)
      .reverse()
      .find((val) => val);
  }
  return value || "";
}

/** Get index of first header added by an ADD_COLUMNS_ROWS command */
export function getAddHeaderStartIndex(position: "before" | "after", base: number): number {
  return position === "after" ? base + 1 : base;
}

/**
 * Compare two objects.
 */
export function deepEquals<T extends Object>(o1: T, o2: T): boolean {
  if (o1 === o2) return true;
  if ((o1 && !o2) || (o2 && !o1)) return false;

  // Objects can have different keys if the values are undefined
  const keys = new Set<string>();
  Object.keys(o1).forEach((key) => keys.add(key));
  Object.keys(o2).forEach((key) => keys.add(key));

  for (let key of keys) {
    if (typeof o1[key] !== typeof o1[key]) return false;
    if (typeof o1[key] === "object") {
      if (!deepEquals(o1[key], o2[key])) return false;
    } else {
      if (o1[key] !== o2[key]) return false;
    }
  }

  return true;
}

/**
 * Return an object with all the keys in the object that have a falsy value removed.
 */
export function removeFalsyAttributes(obj: Object): Object {
  const cleanObject = { ...obj };
  Object.keys(cleanObject).forEach((key) => !cleanObject[key] && delete cleanObject[key]);
  return cleanObject;
}

/** Transform a string to lower case. If the string is undefined, return an empty string */
export function toLowerCase(str: string | undefined): string {
  return str ? str.toLowerCase() : "";
}

export function transpose2dArray<T>(matrix: T[][]): T[][] {
  if (!matrix.length) return matrix;
  return matrix[0].map((_, i) => matrix.map((row) => row[i]));
}

/**
 * Equivalent to "\s" in regexp, minus the new lines characters
 *
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions/Character_Classes
 */
const whiteSpaceCharacters = [
  " ",
  "\t",
  "\f",
  "\v",
  String.fromCharCode(parseInt("00a0", 16)),
  String.fromCharCode(parseInt("1680", 16)),
  String.fromCharCode(parseInt("2000", 16)),
  String.fromCharCode(parseInt("200a", 16)),
  String.fromCharCode(parseInt("2028", 16)),
  String.fromCharCode(parseInt("2029", 16)),
  String.fromCharCode(parseInt("202f", 16)),
  String.fromCharCode(parseInt("205f", 16)),
  String.fromCharCode(parseInt("3000", 16)),
  String.fromCharCode(parseInt("feff", 16)),
];
const whiteSpaceRegexp = new RegExp(whiteSpaceCharacters.join("|"), "g");
const newLineRegex = /\r\n|\r|\n/g;

/**
 * Replace all the special spaces in a string (non-breaking, tabs, ...) by normal spaces, and all the
 * different newlines types by \n.
 */
export function replaceSpecialSpaces(text: string | undefined): string {
  if (!text) return "";
  text = text.replace(whiteSpaceRegexp, " ");
  text = text.replace(newLineRegex, NEWLINE);
  return text;
}

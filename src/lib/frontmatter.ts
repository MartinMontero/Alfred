// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
/**
 * Frontmatter parsing and manipulation
 * 
 * Handles YAML frontmatter in markdown files (the --- delimited section at the top)
 */

export interface FrontmatterProperty {
  key: string;
  value: string | string[] | boolean | number | null;
  type: 'text' | 'list' | 'boolean' | 'number' | 'date' | 'unknown';
}

export interface ParsedFrontmatter {
  properties: FrontmatterProperty[];
  raw: string;
  startLine: number;
  endLine: number;
}

/**
 * Check if a value looks like a date string
 */
function isDateString(value: string): boolean {
  // ISO date: 2024-01-15 or 2024-01-15T10:30:00
  const isoPattern = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/;
  return isoPattern.test(value);
}

/**
 * Infer the type of a frontmatter value
 */
function inferType(value: unknown): FrontmatterProperty['type'] {
  if (value === null || value === undefined) return 'unknown';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (Array.isArray(value)) return 'list';
  if (typeof value === 'string') {
    if (isDateString(value)) return 'date';
    return 'text';
  }
  return 'unknown';
}

/**
 * Parse YAML frontmatter from markdown content
 * Returns null if no valid frontmatter found
 */
export function parseFrontmatter(content: string): ParsedFrontmatter | null {
  const lines = content.split('\n');
  
  // Must start with ---
  if (lines.length === 0 || lines[0].trim() !== '---') {
    return null;
  }
  
  // Find closing ---
  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIndex = i;
      break;
    }
  }
  
  if (endIndex === -1) {
    return null;
  }
  
  const yamlLines = lines.slice(1, endIndex);
  const raw = yamlLines.join('\n');
  
  // Simple YAML parsing (handles common cases)
  const properties: FrontmatterProperty[] = [];
  let currentKey: string | null = null;
  let currentValue: string | string[] | null = null;
  let inMultilineList = false;
  
  for (const line of yamlLines) {
    // Skip empty lines and comments
    if (line.trim() === '' || line.trim().startsWith('#')) {
      continue;
    }
    
    // List item (- value)
    if (line.match(/^\s+-\s+/)) {
      if (currentKey && inMultilineList) {
        const itemValue = line.replace(/^\s+-\s+/, '').trim();
        if (!Array.isArray(currentValue)) {
          currentValue = [];
        }
        currentValue.push(itemValue);
      }
      continue;
    }
    
    // Key: value pair
    const match = line.match(/^(\w[\w\s-]*?):\s*(.*)$/);
    if (match) {
      // Save previous property if exists
      if (currentKey !== null) {
        properties.push({
          key: currentKey,
          value: currentValue,
          type: inferType(currentValue)
        });
      }
      
      currentKey = match[1].trim();
      const rawValue = match[2].trim();
      
      // Check for inline list: [item1, item2]
      if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
        const listContent = rawValue.slice(1, -1);
        currentValue = listContent.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
        inMultilineList = false;
      }
      // Check for start of multiline list
      else if (rawValue === '') {
        currentValue = [];
        inMultilineList = true;
      }
      // Boolean values
      else if (rawValue === 'true') {
        currentValue = true as unknown as string;
        inMultilineList = false;
      }
      else if (rawValue === 'false') {
        currentValue = false as unknown as string;
        inMultilineList = false;
      }
      // Number values
      else if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
        currentValue = parseFloat(rawValue) as unknown as string;
        inMultilineList = false;
      }
      // Quoted string
      else if ((rawValue.startsWith('"') && rawValue.endsWith('"')) ||
               (rawValue.startsWith("'") && rawValue.endsWith("'"))) {
        currentValue = rawValue.slice(1, -1);
        inMultilineList = false;
      }
      // Plain string
      else {
        currentValue = rawValue;
        inMultilineList = false;
      }
    }
  }
  
  // Save last property
  if (currentKey !== null) {
    properties.push({
      key: currentKey,
      value: currentValue,
      type: inferType(currentValue)
    });
  }
  
  return {
    properties,
    raw,
    startLine: 0,
    endLine: endIndex
  };
}

/**
 * Serialize frontmatter properties back to YAML
 */
export function serializeFrontmatter(properties: FrontmatterProperty[]): string {
  if (properties.length === 0) {
    return '';
  }
  
  const lines: string[] = ['---'];
  
  for (const prop of properties) {
    if (prop.value === null || prop.value === undefined) {
      lines.push(`${prop.key}:`);
    } else if (Array.isArray(prop.value)) {
      if (prop.value.length === 0) {
        lines.push(`${prop.key}: []`);
      } else if (prop.value.length <= 3 && prop.value.every(v => !v.includes(','))) {
        // Inline format for short lists
        lines.push(`${prop.key}: [${prop.value.join(', ')}]`);
      } else {
        // Multiline format
        lines.push(`${prop.key}:`);
        for (const item of prop.value) {
          lines.push(`  - ${item}`);
        }
      }
    } else if (typeof prop.value === 'boolean') {
      lines.push(`${prop.key}: ${prop.value}`);
    } else if (typeof prop.value === 'number') {
      lines.push(`${prop.key}: ${prop.value}`);
    } else {
      // String - quote if contains special characters
      const needsQuotes = /[:#\[\]{}|>&*!?]/.test(prop.value as string) || 
                         (prop.value as string).includes('\n');
      if (needsQuotes) {
        lines.push(`${prop.key}: "${(prop.value as string).replace(/"/g, '\\"')}"`);
      } else {
        lines.push(`${prop.key}: ${prop.value}`);
      }
    }
  }
  
  lines.push('---');
  return lines.join('\n');
}

/**
 * Update frontmatter in document content
 * Returns new content with updated frontmatter
 */
export function updateFrontmatter(
  content: string,
  properties: FrontmatterProperty[]
): string {
  const parsed = parseFrontmatter(content);
  const newFrontmatter = serializeFrontmatter(properties);
  
  if (parsed) {
    // Replace existing frontmatter
    const lines = content.split('\n');
    const afterFrontmatter = lines.slice(parsed.endLine + 1).join('\n');
    
    if (properties.length === 0) {
      // Remove frontmatter entirely
      return afterFrontmatter.replace(/^\n+/, '');
    }
    
    return newFrontmatter + '\n' + afterFrontmatter;
  } else {
    // Add new frontmatter at the beginning
    if (properties.length === 0) {
      return content;
    }
    return newFrontmatter + '\n\n' + content;
  }
}

/**
 * Add or update a single property
 */
export function setProperty(
  content: string,
  key: string,
  value: string | string[] | boolean | number | null
): string {
  const parsed = parseFrontmatter(content);
  const properties = parsed?.properties || [];
  
  // Find existing property
  const existingIndex = properties.findIndex(p => p.key === key);
  
  if (value === null || value === undefined) {
    // Remove property
    if (existingIndex >= 0) {
      properties.splice(existingIndex, 1);
    }
  } else {
    const newProp: FrontmatterProperty = {
      key,
      value,
      type: inferType(value)
    };
    
    if (existingIndex >= 0) {
      properties[existingIndex] = newProp;
    } else {
      properties.push(newProp);
    }
  }
  
  return updateFrontmatter(content, properties);
}

/**
 * Get a single property value
 */
export function getProperty(
  content: string,
  key: string
): string | string[] | boolean | number | null {
  const parsed = parseFrontmatter(content);
  if (!parsed) return null;
  
  const prop = parsed.properties.find(p => p.key === key);
  return prop?.value ?? null;
}

/**
 * Remove a property
 */
export function removeProperty(content: string, key: string): string {
  return setProperty(content, key, null);
}

/**
 * Frontmatter/body split for editor round-trip protection (W1 bug #3).
 *
 * Markdown treats `---` as a thematic break as well as a frontmatter fence;
 * a serializer that never learned about frontmatter rewrites the fence
 * (observed in the field as `***` + heading mutations), after which the
 * parser above returns null forever and property edits stack duplicate
 * blocks. The editor must therefore never see the frontmatter at all:
 * split before the document enters the editor, join on every serialize.
 */
export interface FrontmatterSplit {
  /** The verbatim frontmatter block including both fences, or null. */
  frontmatter: string | null;
  /** Everything after the closing fence (byte-preserved). */
  body: string;
}

export function splitFrontmatter(content: string): FrontmatterSplit {
  const parsed = parseFrontmatter(content);
  if (!parsed) return { frontmatter: null, body: content };
  // Index math (not line surgery) so join(split(x)) is byte-exact for every
  // trailing-newline shape. The frontmatter keeps the newline after the
  // closing fence when one exists.
  const fenceEnd = content.split('\n').slice(0, parsed.endLine + 1).join('\n').length;
  const hasNewlineAfter = content.length > fenceEnd && content[fenceEnd] === '\n';
  const cut = hasNewlineAfter ? fenceEnd + 1 : fenceEnd;
  return { frontmatter: content.slice(0, cut), body: content.slice(cut) };
}

export function joinFrontmatter(frontmatter: string | null, body: string): string {
  if (frontmatter === null) return body;
  return frontmatter + body;
}

/**
 * Detect a frontmatter-shaped block that is NOT at the top of the note:
 * two fence lines below line 0 with at least one `key:` line between them.
 * Deliberately narrow — a lone thematic break in prose must not trip it.
 */
export function hasDisplacedFrontmatter(content: string): boolean {
  if (parseFrontmatter(content)) return false;
  const lines = content.split('\n');
  const fenceIdx: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') fenceIdx.push(i);
  }
  for (let f = 0; f + 1 < fenceIdx.length; f++) {
    const [a, b] = [fenceIdx[f], fenceIdx[f + 1]];
    if (b - a > 1) {
      const between = lines.slice(a + 1, b);
      if (between.some((l) => /^[A-Za-z0-9_-]+\s*:/.test(l.trim()))) return true;
    }
  }
  return false;
}

export interface ApplyPropertiesResult {
  content: string;
  /** True when the note has a displaced frontmatter block; content is returned unchanged. */
  fenceDisplaced: boolean;
}

/**
 * Merge an updated property set into note content (extracted from the
 * Properties panel so it is unit-testable). Prepending a new block is the
 * intended behavior ONLY for a note with no frontmatter anywhere; when a
 * displaced block exists, prepending is exactly what stacked duplicate
 * fences in the field (W1 bug #3) — refuse and flag instead.
 */
export function applyPropertiesToContent(
  content: string,
  updatedProps: FrontmatterProperty[],
): ApplyPropertiesResult {
  const parsed = parseFrontmatter(content);
  if (parsed) {
    const lines = content.split('\n');
    const afterFrontmatter = lines.slice(parsed.endLine + 1).join('\n');
    if (updatedProps.length === 0) {
      return { content: afterFrontmatter.replace(/^\n+/, ''), fenceDisplaced: false };
    }
    return { content: `${serializeFrontmatter(updatedProps)}\n${afterFrontmatter}`, fenceDisplaced: false };
  }
  if (hasDisplacedFrontmatter(content)) {
    return { content, fenceDisplaced: true };
  }
  if (updatedProps.length === 0) {
    return { content, fenceDisplaced: false };
  }
  return { content: `${serializeFrontmatter(updatedProps)}\n\n${content}`, fenceDisplaced: false };
}

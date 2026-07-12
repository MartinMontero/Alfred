// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
import { Component, createSignal, createEffect, createMemo, onCleanup, For, Show, untrack } from 'solid-js';
import type { Cell, CellFormulaValue } from 'exceljs';
import { platform } from '@platform';

interface XlsxViewerProps {
  path: string;
  vaultPath: string | null;
}

interface SheetData {
  name: string;
  headers: string[];
  rows: string[][];
}

type HfCell = string | number | boolean | null;

function coerceFormulaResult(result: CellFormulaValue['result']): HfCell {
  if (result === null || result === undefined) return null;
  if (result instanceof Date) return result.toISOString();
  if (typeof result === 'object') return result.error;
  return result;
}

/**
 * Map an exceljs cell onto HyperFormula's raw-content model: formula text when
 * the file carries one, otherwise the stored value. Dates become ISO strings
 * (HyperFormula receives them as text, matching the old serial-number fidelity).
 */
function toHyperFormulaCell(cell: Cell): HfCell {
  const value = cell.value;
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if ('formula' in value || 'sharedFormula' in value) {
    // cell.formula is translated for shared-formula slaves; when no formula
    // text is recoverable, fall back to the file's cached result.
    const formulaText = cell.formula;
    if (typeof formulaText === 'string' && formulaText.length > 0) return '=' + formulaText;
    return coerceFormulaResult(value.result);
  }
  if ('richText' in value) return value.richText.map((part) => part.text).join('');
  if ('hyperlink' in value) return value.text;
  if ('error' in value) return value.error;
  return null;
}

/** Rows rendered above/below the visible window to avoid blanking while scrolling. */
const ROW_OVERSCAN = 20;
/** Estimated row stride (13px text + 2*6px padding + collapsed 1px border); corrected by measurement. */
const DEFAULT_ROW_HEIGHT = 28;

const XlsxViewer: Component<XlsxViewerProps> = (props) => {
  const [sheets, setSheets] = createSignal<SheetData[]>([]);
  const [activeSheet, setActiveSheet] = createSignal(0);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  // Virtualization state
  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewportHeight, setViewportHeight] = createSignal(600);
  const [rowHeight, setRowHeight] = createSignal(DEFAULT_ROW_HEIGHT);

  let containerRef: HTMLDivElement | undefined;

  createEffect(() => {
    const filePath = props.path;
    if (!filePath) return;

    setLoading(true);
    setError(null);
    setSheets([]);
    setActiveSheet(0);

    let cancelled = false;

    (async () => {
      try {
        // Read binary file via platform adapter
        const arrayBuffer = await platform.vault.readBinary(filePath, props.vaultPath ?? '');
        if (cancelled) return;

        // Lazy-load exceljs (registry-published; replaced the CDN-distributed
        // SheetJS build) and HyperFormula
        const [excelJsModule, { HyperFormula }] = await Promise.all([
          import('exceljs'),
          import('hyperformula'),
        ]);
        if (cancelled) return;
        // exceljs ships CJS/UMD; depending on bundler interop the API may sit on `default`
        const ExcelJS = excelJsModule.default ?? excelJsModule;

        // Parse workbook with formulas preserved. exceljs types demand a Node
        // Buffer, but its loader accepts any binary view at runtime.
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
        if (cancelled) return;

        // Build sheet data for HyperFormula: array of arrays per sheet
        const sheetData: Record<string, HfCell[][]> = {};
        const sheetNames: string[] = [];

        for (const worksheet of workbook.worksheets) {
          sheetNames.push(worksheet.name);
          const rowCount = worksheet.rowCount;
          const colCount = worksheet.columnCount;
          if (rowCount === 0 || colCount === 0) {
            sheetData[worksheet.name] = [[]];
            continue;
          }

          const rows: HfCell[][] = [];
          for (let r = 1; r <= rowCount; r++) {
            const sheetRow = worksheet.getRow(r);
            const row: HfCell[] = [];
            for (let c = 1; c <= colCount; c++) {
              row.push(toHyperFormulaCell(sheetRow.getCell(c)));
            }
            rows.push(row);
          }

          sheetData[worksheet.name] = rows;
        }

        // Build HyperFormula instance with all sheets for cross-sheet references
        const hfSheets: Record<string, (string | number | boolean | null)[][]> = {};
        for (const name of sheetNames) {
          hfSheets[name] = sheetData[name];
        }

        const hf = HyperFormula.buildFromSheets(hfSheets, {
          licenseKey: 'gpl-v3',
        });

        // Extract computed values from HyperFormula
        const parsedSheets: SheetData[] = [];
        for (let si = 0; si < sheetNames.length; si++) {
          const sheetName = sheetNames[si];
          const computed = hf.getSheetSerialized(si);

          if (!computed || computed.length === 0) {
            parsedSheets.push({ name: sheetName, headers: [], rows: [] });
            continue;
          }

          // Use getSheetValues to get the calculated values (not formulas)
          const values = hf.getSheetValues(si);
          const allRows: string[][] = values.map((row: any[]) =>
            row.map((cell: any) => {
              if (cell === null || cell === undefined) return '';
              return String(cell);
            })
          );

          const headers = allRows[0] || [];
          const dataRows = allRows.slice(1);

          parsedSheets.push({ name: sheetName, headers, rows: dataRows });
        }

        hf.destroy();

        if (cancelled) return;
        setSheets(parsedSheets);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to render XLSX:', err);
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    })();

    onCleanup(() => { cancelled = true; });
  });

  const currentSheet = () => sheets()[activeSheet()] || null;

  // --- Windowed row rendering ---
  const totalRows = createMemo(() => currentSheet()?.rows.length ?? 0);
  const startIndex = createMemo(() =>
    Math.max(0, Math.floor(scrollTop() / rowHeight()) - ROW_OVERSCAN)
  );
  const endIndex = createMemo(() =>
    Math.min(totalRows(), Math.ceil((scrollTop() + viewportHeight()) / rowHeight()) + ROW_OVERSCAN)
  );
  const visibleRows = createMemo(() => {
    const sheet = currentSheet();
    return sheet ? sheet.rows.slice(startIndex(), endIndex()) : [];
  });
  const topSpacerHeight = () => startIndex() * rowHeight();
  const bottomSpacerHeight = () => Math.max(0, (totalRows() - endIndex()) * rowHeight());
  const columnCount = createMemo(() => {
    const sheet = currentSheet();
    if (!sheet) return 1;
    return Math.max(sheet.headers.length, sheet.rows[0]?.length ?? 0) + 1;
  });

  // Scroll container: rAF-throttled passive scroll tracking + viewport size tracking
  const setContainerRef = (el: HTMLDivElement) => {
    containerRef = el;
    let rafId: number | null = null;
    const onScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        setScrollTop(el.scrollTop);
        setViewportHeight(el.clientHeight);
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    const resizeObserver = new ResizeObserver(() => setViewportHeight(el.clientHeight));
    resizeObserver.observe(el);
    requestAnimationFrame(() => setViewportHeight(el.clientHeight));
    onCleanup(() => {
      el.removeEventListener('scroll', onScroll);
      resizeObserver.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (containerRef === el) containerRef = undefined;
    });
  };

  // Reset scroll when the sheet (or workbook) changes
  createEffect(() => {
    activeSheet();
    sheets();
    if (containerRef) containerRef.scrollTop = 0;
    setScrollTop(0);
  });

  // Measure the real row stride from rendered rows so spacer math matches actual layout
  createEffect(() => {
    const sheet = currentSheet();
    if (!sheet || sheet.rows.length === 0) return;
    requestAnimationFrame(() => {
      if (!containerRef) return;
      const rendered = containerRef.querySelectorAll('tbody tr[data-xlsx-row]');
      let measured = 0;
      if (rendered.length >= 2) {
        measured = rendered[1].getBoundingClientRect().top - rendered[0].getBoundingClientRect().top;
      } else if (rendered.length === 1) {
        measured = rendered[0].getBoundingClientRect().height;
      }
      if (measured > 4 && Math.abs(measured - untrack(rowHeight)) > 0.5) {
        setRowHeight(measured);
      }
    });
  });

  return (
    <div class="xlsx-viewer">
      {loading() && (
        <div class="viewer-loading">Loading spreadsheet...</div>
      )}
      {error() && (
        <div class="viewer-error">Failed to load spreadsheet: {error()}</div>
      )}
      <Show when={!loading() && !error() && sheets().length > 0}>
        {/* Sheet tabs */}
        <Show when={sheets().length > 1}>
          <div class="xlsx-sheet-tabs">
            <For each={sheets()}>
              {(sheet, index) => (
                <button
                  class={`xlsx-sheet-tab ${index() === activeSheet() ? 'active' : ''}`}
                  onClick={() => setActiveSheet(index())}
                >
                  {sheet.name}
                </button>
              )}
            </For>
          </div>
        </Show>

        {/* Table */}
        <div class="xlsx-table-container" ref={setContainerRef}>
          <Show when={currentSheet()}>
            <table class="xlsx-table">
              <Show when={currentSheet()!.headers.length > 0}>
                <thead>
                  <tr>
                    <th class="xlsx-row-number">#</th>
                    <For each={currentSheet()!.headers}>
                      {(header) => <th>{header}</th>}
                    </For>
                  </tr>
                </thead>
              </Show>
              <tbody>
                <Show when={topSpacerHeight() > 0}>
                  <tr
                    aria-hidden="true"
                    style={{ height: `${topSpacerHeight()}px`, background: 'transparent' }}
                  >
                    <td colspan={columnCount()} style={{ padding: '0', border: 'none' }} />
                  </tr>
                </Show>
                <For each={visibleRows()}>
                  {(row, rowIndex) => (
                    <tr data-xlsx-row>
                      <td class="xlsx-row-number">{startIndex() + rowIndex() + 1}</td>
                      <For each={row}>
                        {(cell) => <td>{cell}</td>}
                      </For>
                    </tr>
                  )}
                </For>
                <Show when={bottomSpacerHeight() > 0}>
                  <tr
                    aria-hidden="true"
                    style={{ height: `${bottomSpacerHeight()}px`, background: 'transparent' }}
                  >
                    <td colspan={columnCount()} style={{ padding: '0', border: 'none' }} />
                  </tr>
                </Show>
              </tbody>
            </table>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default XlsxViewer;

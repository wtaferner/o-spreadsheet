import { FORBIDDEN_IN_EXCEL_REGEX } from "../../constants";
import {
  createDefaultRows,
  getUnquotedSheetName,
  groupConsecutive,
  isDefined,
  isZoneInside,
  isZoneValid,
  positions,
  toCartesian,
} from "../../helpers/index";
import { _lt, _t } from "../../translation";
import {
  Cell,
  CellPosition,
  Command,
  CommandResult,
  CoreCommand,
  CreateSheetCommand,
  Dimension,
  ExcelWorkbookData,
  FreezeColumnsCommand,
  FreezeRowsCommand,
  HeaderIndex,
  PaneDivision,
  RenameSheetCommand,
  Row,
  Sheet,
  SheetData,
  UID,
  UpdateCellPositionCommand,
  WorkbookData,
  Zone,
  ZoneDimension,
} from "../../types/index";
import { CorePlugin } from "../core_plugin";

interface SheetState {
  readonly sheets: Record<UID, Sheet | undefined>;
  readonly orderedSheetIds: UID[];
  readonly sheetIdsMapName: Record<string, UID | undefined>;
  readonly cellPosition: Record<UID, CellPosition | undefined>;
}

export class SheetPlugin extends CorePlugin<SheetState> implements SheetState {
  static getters = [
    "getSheetName",
    "tryGetSheetName",
    "getSheet",
    "tryGetSheet",
    "getSheetIdByName",
    "getSheetIds",
    "getVisibleSheetIds",
    "isSheetVisible",
    "getEvaluationSheets",
    "doesHeaderExist",
    "getCell",
    "getCellPosition",
    "getColsZone",
    "getRowCells",
    "getRowsZone",
    "getNumberCols",
    "getNumberRows",
    "getNumberHeaders",
    "getGridLinesVisibility",
    "getNextSheetName",
    "isEmpty",
    "getSheetSize",
    "getSheetZone",
    "getPaneDivisions",
  ] as const;

  readonly sheetIdsMapName: Record<string, UID | undefined> = {};
  readonly orderedSheetIds: UID[] = [];
  readonly sheets: Record<UID, Sheet | undefined> = {};
  readonly cellPosition: Record<UID, CellPosition | undefined> = {};

  // ---------------------------------------------------------------------------
  // Command Handling
  // ---------------------------------------------------------------------------

  allowDispatch(cmd: CoreCommand) {
    const genericChecks = this.chainValidations(this.checkSheetExists, this.checkZones)(cmd);
    if (genericChecks !== CommandResult.Success) {
      return genericChecks;
    }
    switch (cmd.type) {
      case "HIDE_SHEET": {
        if (this.getVisibleSheetIds().length === 1) {
          return CommandResult.NotEnoughSheets;
        }
        return CommandResult.Success;
      }
      case "CREATE_SHEET": {
        return this.checkValidations(cmd, this.checkSheetName, this.checkSheetPosition);
      }
      case "MOVE_SHEET":
        const currentIndex = this.orderedSheetIds.indexOf(cmd.sheetId);
        if (cmd.direction === "left") {
          const leftSheets = this.orderedSheetIds
            .slice(0, currentIndex)
            .map((id) => !this.isSheetVisible(id));
          return leftSheets.every((isHidden) => isHidden)
            ? CommandResult.WrongSheetMove
            : CommandResult.Success;
        } else {
          const rightSheets = this.orderedSheetIds
            .slice(currentIndex + 1)
            .map((id) => !this.isSheetVisible(id));
          return rightSheets.every((isHidden) => isHidden)
            ? CommandResult.WrongSheetMove
            : CommandResult.Success;
        }
      case "RENAME_SHEET":
        return this.isRenameAllowed(cmd);
      case "DELETE_SHEET":
        return this.orderedSheetIds.length > 1
          ? CommandResult.Success
          : CommandResult.NotEnoughSheets;
      case "REMOVE_COLUMNS_ROWS": {
        const length =
          cmd.dimension === "COL"
            ? this.getNumberCols(cmd.sheetId)
            : this.getNumberRows(cmd.sheetId);
        return length > cmd.elements.length
          ? CommandResult.Success
          : CommandResult.NotEnoughElements;
      }
      case "FREEZE_ROWS": {
        return this.checkValidations(
          cmd,
          this.checkRowFreezeQuantity,
          this.checkRowFreezeOverlapMerge
        );
      }
      case "FREEZE_COLUMNS": {
        return this.checkValidations(
          cmd,
          this.checkColFreezeQuantity,
          this.checkColFreezeOverlapMerge
        );
      }
      default:
        return CommandResult.Success;
    }
  }

  handle(cmd: CoreCommand) {
    switch (cmd.type) {
      case "SET_GRID_LINES_VISIBILITY":
        this.setGridLinesVisibility(cmd.sheetId, cmd.areGridLinesVisible);
        break;
      case "DELETE_CONTENT":
        this.clearZones(cmd.sheetId, cmd.target);
        break;
      case "CREATE_SHEET":
        const sheet = this.createSheet(
          cmd.sheetId,
          cmd.name || this.getNextSheetName(),
          cmd.cols || 26,
          cmd.rows || 100,
          cmd.position
        );
        this.history.update("sheetIdsMapName", sheet.name, sheet.id);
        break;
      case "MOVE_SHEET":
        this.moveSheet(cmd.sheetId, cmd.direction);
        break;
      case "RENAME_SHEET":
        this.renameSheet(this.sheets[cmd.sheetId]!, cmd.name!);
        break;
      case "HIDE_SHEET":
        this.hideSheet(cmd.sheetId);
        break;
      case "SHOW_SHEET":
        this.showSheet(cmd.sheetId);
        break;
      case "DUPLICATE_SHEET":
        this.duplicateSheet(cmd.sheetId, cmd.sheetIdTo);
        break;
      case "DELETE_SHEET":
        this.deleteSheet(this.sheets[cmd.sheetId]!);
        break;

      case "REMOVE_COLUMNS_ROWS":
        if (cmd.dimension === "COL") {
          this.removeColumns(this.sheets[cmd.sheetId]!, [...cmd.elements]);
        } else {
          this.removeRows(this.sheets[cmd.sheetId]!, [...cmd.elements]);
        }
        break;
      case "ADD_COLUMNS_ROWS":
        if (cmd.dimension === "COL") {
          this.addColumns(this.sheets[cmd.sheetId]!, cmd.base, cmd.position, cmd.quantity);
        } else {
          this.addRows(this.sheets[cmd.sheetId]!, cmd.base, cmd.position, cmd.quantity);
        }
        break;
      case "UPDATE_CELL_POSITION":
        this.updateCellPosition(cmd);
        break;
      case "FREEZE_COLUMNS":
        this.setPaneDivisions(cmd.sheetId, cmd.quantity, "COL");
        break;
      case "FREEZE_ROWS":
        this.setPaneDivisions(cmd.sheetId, cmd.quantity, "ROW");
        break;
      case "UNFREEZE_ROWS":
        this.setPaneDivisions(cmd.sheetId, 0, "ROW");
        break;
      case "UNFREEZE_COLUMNS":
        this.setPaneDivisions(cmd.sheetId, 0, "COL");
        break;
      case "UNFREEZE_COLUMNS_ROWS":
        this.setPaneDivisions(cmd.sheetId, 0, "COL");
        this.setPaneDivisions(cmd.sheetId, 0, "ROW");
    }
  }

  // ---------------------------------------------------------------------------
  // Import/Export
  // ---------------------------------------------------------------------------

  import(data: WorkbookData) {
    // we need to fill the sheetIds mapping first, because otherwise formulas
    // that depends on a sheet not already imported will not be able to be
    // compiled
    for (let sheet of data.sheets) {
      this.sheetIdsMapName[sheet.name] = sheet.id;
    }

    for (let sheetData of data.sheets) {
      const name = sheetData.name || _t("Sheet") + (Object.keys(this.sheets).length + 1);
      const { colNumber, rowNumber } = this.getImportedSheetSize(sheetData);
      const sheet: Sheet = {
        id: sheetData.id,
        name: name,
        numberOfCols: colNumber,
        rows: createDefaultRows(rowNumber),
        areGridLinesVisible:
          sheetData.areGridLinesVisible === undefined ? true : sheetData.areGridLinesVisible,
        isVisible: sheetData.isVisible,
        panes: {
          xSplit: sheetData.panes?.xSplit || 0,
          ySplit: sheetData.panes?.ySplit || 0,
        },
      };
      this.orderedSheetIds.push(sheet.id);
      this.sheets[sheet.id] = sheet;
    }
  }

  private exportSheets(data: WorkbookData) {
    data.sheets = this.orderedSheetIds.filter(isDefined).map((id) => {
      const sheet = this.sheets[id]!;
      const sheetData: SheetData = {
        id: sheet.id,
        name: sheet.name,
        colNumber: sheet.numberOfCols,
        rowNumber: this.getters.getNumberRows(sheet.id),
        rows: {},
        cols: {},
        merges: [],
        cells: {},
        conditionalFormats: [],
        figures: [],
        filterTables: [],
        areGridLinesVisible:
          sheet.areGridLinesVisible === undefined ? true : sheet.areGridLinesVisible,
        isVisible: sheet.isVisible,
      };
      if (sheet.panes.xSplit || sheet.panes.ySplit) {
        sheetData.panes = sheet.panes;
      }
      return sheetData;
    });
  }

  export(data: WorkbookData) {
    this.exportSheets(data);
  }

  exportForExcel(data: ExcelWorkbookData) {
    this.exportSheets(data);
  }

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  getGridLinesVisibility(sheetId: UID): boolean {
    return this.getSheet(sheetId).areGridLinesVisible;
  }

  tryGetSheet(sheetId: UID): Sheet | undefined {
    return this.sheets[sheetId];
  }

  getSheet(sheetId: UID): Sheet {
    const sheet = this.sheets[sheetId];
    if (!sheet) {
      throw new Error(`Sheet ${sheetId} not found.`);
    }
    return sheet;
  }

  isSheetVisible(sheetId: UID): boolean {
    return this.getSheet(sheetId).isVisible;
  }

  /**
   * Return the sheet name. Throw if the sheet is not found.
   */
  getSheetName(sheetId: UID): string {
    return this.getSheet(sheetId).name;
  }

  /**
   * Return the sheet name or undefined if the sheet doesn't exist.
   */
  tryGetSheetName(sheetId: UID): string | undefined {
    return this.tryGetSheet(sheetId)?.name;
  }

  getSheetIdByName(name: string | undefined): UID | undefined {
    if (name) {
      const unquotedName = getUnquotedSheetName(name);
      for (const key in this.sheetIdsMapName) {
        if (key.toUpperCase() === unquotedName.toUpperCase()) {
          return this.sheetIdsMapName[key];
        }
      }
    }
    return undefined;
  }

  getSheetIds(): UID[] {
    return this.orderedSheetIds;
  }

  getVisibleSheetIds(): UID[] {
    return this.orderedSheetIds.filter(this.isSheetVisible.bind(this));
  }

  getEvaluationSheets(): Record<UID, Sheet | undefined> {
    return this.sheets;
  }

  doesHeaderExist(sheetId: UID, dimension: Dimension, index: number) {
    return dimension === "COL"
      ? index >= 0 && index < this.getNumberCols(sheetId)
      : index >= 0 && index < this.getNumberRows(sheetId);
  }

  getRow(sheetId: UID, index: HeaderIndex): Row {
    const row = this.getSheet(sheetId).rows[index];
    if (!row) {
      throw new Error(`Row ${row} not found.`);
    }
    return row;
  }

  getCell({ sheetId, col, row }: CellPosition): Cell | undefined {
    const sheet = this.tryGetSheet(sheetId);
    const cellId = sheet?.rows[row]?.cells[col];
    if (cellId === undefined) {
      return undefined;
    }
    return this.getters.getCellById(cellId);
  }

  getColsZone(sheetId: UID, start: HeaderIndex, end: HeaderIndex): Zone {
    return {
      top: 0,
      bottom: this.getNumberRows(sheetId) - 1,
      left: start,
      right: end,
    };
  }

  getRowCells(sheetId: UID, row: HeaderIndex): UID[] {
    return Object.values(this.getSheet(sheetId).rows[row]?.cells).filter(isDefined);
  }

  getRowsZone(sheetId: UID, start: HeaderIndex, end: HeaderIndex): Zone {
    return {
      top: start,
      bottom: end,
      left: 0,
      right: this.getSheet(sheetId).numberOfCols - 1,
    };
  }

  getCellPosition(cellId: UID): CellPosition {
    const cell = this.cellPosition[cellId];
    if (!cell) {
      throw new Error(`asking for a cell position that doesn't exist, cell id: ${cellId}`);
    }
    return cell;
  }

  getNumberCols(sheetId: UID) {
    return this.getSheet(sheetId).numberOfCols;
  }

  getNumberRows(sheetId: UID) {
    return this.getSheet(sheetId).rows.length;
  }

  getNumberHeaders(sheetId: UID, dimension: Dimension) {
    return dimension === "COL" ? this.getNumberCols(sheetId) : this.getNumberRows(sheetId);
  }

  getNextSheetName(baseName = "Sheet"): string {
    let i = 1;
    const names = this.orderedSheetIds.map(this.getSheetName.bind(this));
    let name = `${baseName}${i}`;
    while (names.includes(name)) {
      name = `${baseName}${i}`;
      i++;
    }
    return name;
  }

  getSheetSize(sheetId: UID): ZoneDimension {
    return {
      height: this.getNumberRows(sheetId),
      width: this.getNumberCols(sheetId),
    };
  }

  getSheetZone(sheetId: UID): Zone {
    return {
      top: 0,
      left: 0,
      bottom: this.getNumberRows(sheetId) - 1,
      right: this.getNumberCols(sheetId) - 1,
    };
  }

  getPaneDivisions(sheetId: UID): Readonly<PaneDivision> {
    return this.getSheet(sheetId).panes;
  }

  private setPaneDivisions(sheetId: UID, base: HeaderIndex, dimension: Dimension) {
    const panes = { ...this.getPaneDivisions(sheetId) };
    if (dimension === "COL") {
      panes.xSplit = base;
    } else if (dimension === "ROW") {
      panes.ySplit = base;
    }
    this.history.update("sheets", sheetId, "panes", panes);
  }

  // ---------------------------------------------------------------------------
  // Row/Col manipulation
  // ---------------------------------------------------------------------------

  /**
   * Check if a zone only contains empty cells
   */
  isEmpty(sheetId: UID, zone: Zone): boolean {
    return positions(zone)
      .map(({ col, row }) => this.getCell({ sheetId, col, row }))
      .every((cell) => !cell || cell.content === "");
  }

  private updateCellPosition(cmd: UpdateCellPositionCommand) {
    const { sheetId, cellId, col, row } = cmd;
    if (cellId) {
      this.setNewPosition(cellId, sheetId, col, row);
    } else {
      this.clearPosition(sheetId, col, row);
    }
  }

  /**
   * Set the cell at a new position and clear its previous position.
   */
  private setNewPosition(cellId: UID, sheetId: UID, col: HeaderIndex, row: HeaderIndex) {
    const currentPosition = this.cellPosition[cellId];
    if (currentPosition) {
      this.clearPosition(sheetId, currentPosition.col, currentPosition.row);
    }
    this.history.update("cellPosition", cellId, {
      row: row,
      col: col,
      sheetId: sheetId,
    });
    this.history.update("sheets", sheetId, "rows", row, "cells", col, cellId);
  }

  /**
   * Remove the cell at the given position (if there's one)
   */
  private clearPosition(sheetId: UID, col: HeaderIndex, row: HeaderIndex) {
    const cellId = this.sheets[sheetId]?.rows[row].cells[col];
    if (cellId) {
      this.history.update("cellPosition", cellId, undefined);
      this.history.update("sheets", sheetId, "rows", row, "cells", col, undefined);
    }
  }

  private setGridLinesVisibility(sheetId: UID, areGridLinesVisible: boolean) {
    this.history.update("sheets", sheetId, "areGridLinesVisible", areGridLinesVisible);
  }

  private clearZones(sheetId: UID, zones: Zone[]) {
    for (let zone of zones) {
      for (let col = zone.left; col <= zone.right; col++) {
        for (let row = zone.top; row <= zone.bottom; row++) {
          const cell = this.sheets[sheetId]!.rows[row].cells[col];
          if (cell) {
            this.dispatch("UPDATE_CELL", {
              sheetId: sheetId,
              content: "",
              col,
              row,
            });
          }
        }
      }
    }
  }

  private createSheet(
    id: UID,
    name: string,
    colNumber: number,
    rowNumber: number,
    position: number
  ): Sheet {
    const sheet: Sheet = {
      id,
      name,
      numberOfCols: colNumber,
      rows: createDefaultRows(rowNumber),
      areGridLinesVisible: true,
      isVisible: true,
      panes: {
        xSplit: 0,
        ySplit: 0,
      },
    };
    const orderedSheetIds = this.orderedSheetIds.slice();
    orderedSheetIds.splice(position, 0, sheet.id);
    const sheets = this.sheets;
    this.history.update("orderedSheetIds", orderedSheetIds);
    this.history.update("sheets", Object.assign({}, sheets, { [sheet.id]: sheet }));
    return sheet;
  }

  private moveSheet(sheetId: UID, direction: "left" | "right") {
    const orderedSheetIds = this.orderedSheetIds.slice();
    const currentIndex = orderedSheetIds.findIndex((id) => id === sheetId);
    const sheet = orderedSheetIds.splice(currentIndex, 1);
    let index =
      direction === "left"
        ? this.findIndexOfPreviousVisibleSheet(currentIndex - 1, orderedSheetIds)
        : this.findIndexOfNextVisibleSheet(currentIndex + 1, orderedSheetIds);
    if (index === undefined) {
      index = orderedSheetIds.length;
    }
    orderedSheetIds.splice(index, 0, sheet[0]);
    this.history.update("orderedSheetIds", orderedSheetIds);
  }

  private findIndexOfPreviousVisibleSheet(current: HeaderIndex, orderedSheetIds: UID[]) {
    while (current >= 0 && !this.isSheetVisible(orderedSheetIds[current])) {
      current--;
    }
    if (current === -1) {
      throw new Error("There is no previous visible sheet");
    }
    return current;
  }

  private findIndexOfNextVisibleSheet(current: HeaderIndex, orderedSheetIds: UID[]) {
    while (current < orderedSheetIds.length && !this.isSheetVisible(orderedSheetIds[current])) {
      current++;
    }
    if (
      current === orderedSheetIds.length - 1 &&
      !this.isSheetVisible(orderedSheetIds[current - 1])
    ) {
      return undefined;
    }
    return current;
  }

  private checkSheetName(cmd: RenameSheetCommand | CreateSheetCommand): CommandResult {
    const { orderedSheetIds, sheets } = this;
    const name = cmd.name && cmd.name.trim().toLowerCase();

    if (orderedSheetIds.find((id) => sheets[id]?.name.toLowerCase() === name)) {
      return CommandResult.DuplicatedSheetName;
    }
    if (FORBIDDEN_IN_EXCEL_REGEX.test(name!)) {
      return CommandResult.ForbiddenCharactersInSheetName;
    }
    return CommandResult.Success;
  }

  private checkSheetPosition(cmd: CreateSheetCommand) {
    const { orderedSheetIds } = this;
    if (cmd.position > orderedSheetIds.length || cmd.position < 0) {
      return CommandResult.WrongSheetPosition;
    }
    return CommandResult.Success;
  }

  private checkRowFreezeQuantity(cmd: FreezeRowsCommand): CommandResult {
    return cmd.quantity >= 1 && cmd.quantity < this.getNumberRows(cmd.sheetId)
      ? CommandResult.Success
      : CommandResult.InvalidFreezeQuantity;
  }

  private checkColFreezeQuantity(cmd: FreezeColumnsCommand): CommandResult {
    return cmd.quantity >= 1 && cmd.quantity < this.getNumberCols(cmd.sheetId)
      ? CommandResult.Success
      : CommandResult.InvalidFreezeQuantity;
  }

  private checkRowFreezeOverlapMerge(cmd: FreezeRowsCommand): CommandResult {
    const merges = this.getters.getMerges(cmd.sheetId);
    for (let merge of merges) {
      if (merge.top < cmd.quantity && cmd.quantity <= merge.bottom) {
        return CommandResult.MergeOverlap;
      }
    }
    return CommandResult.Success;
  }

  private checkColFreezeOverlapMerge(cmd: FreezeColumnsCommand): CommandResult {
    const merges = this.getters.getMerges(cmd.sheetId);
    for (let merge of merges) {
      if (merge.left < cmd.quantity && cmd.quantity <= merge.right) {
        return CommandResult.MergeOverlap;
      }
    }
    return CommandResult.Success;
  }

  private isRenameAllowed(cmd: RenameSheetCommand): CommandResult {
    const name = cmd.name && cmd.name.trim().toLowerCase();
    if (!name) {
      return CommandResult.MissingSheetName;
    }
    return this.checkSheetName(cmd);
  }

  private renameSheet(sheet: Sheet, name: string) {
    const oldName = sheet.name;
    this.history.update("sheets", sheet.id, "name", name.trim());
    const sheetIdsMapName = Object.assign({}, this.sheetIdsMapName);
    sheetIdsMapName[name] = sheet.id;
    delete sheetIdsMapName[oldName];
    this.history.update("sheetIdsMapName", sheetIdsMapName);
  }

  private hideSheet(sheetId: UID) {
    this.history.update("sheets", sheetId, "isVisible", false);
  }

  private showSheet(sheetId: UID) {
    this.history.update("sheets", sheetId, "isVisible", true);
  }

  private duplicateSheet(fromId: UID, toId: UID) {
    const sheet = this.getSheet(fromId);
    const toName = this.getDuplicateSheetName(sheet.name);
    const newSheet: Sheet = JSON.parse(JSON.stringify(sheet));
    newSheet.id = toId;
    newSheet.name = toName;
    for (let col = 0; col <= newSheet.numberOfCols; col++) {
      for (let row = 0; row <= newSheet.rows.length; row++) {
        if (newSheet.rows[row]) {
          newSheet.rows[row].cells[col] = undefined;
        }
      }
    }
    const orderedSheetIds = this.orderedSheetIds.slice();
    const currentIndex = orderedSheetIds.indexOf(fromId);
    orderedSheetIds.splice(currentIndex + 1, 0, newSheet.id);
    this.history.update("orderedSheetIds", orderedSheetIds);
    this.history.update("sheets", Object.assign({}, this.sheets, { [newSheet.id]: newSheet }));

    for (const cell of Object.values(this.getters.getCells(fromId))) {
      const { col, row } = this.getCellPosition(cell.id);
      this.dispatch("UPDATE_CELL", {
        sheetId: newSheet.id,
        col,
        row,
        content: cell.content,
        format: cell.format,
        style: cell.style,
      });
    }

    const sheetIdsMapName = Object.assign({}, this.sheetIdsMapName);
    sheetIdsMapName[newSheet.name] = newSheet.id;
    this.history.update("sheetIdsMapName", sheetIdsMapName);
  }

  private getDuplicateSheetName(sheetName: string) {
    let i = 1;
    const names = this.orderedSheetIds.map(this.getSheetName.bind(this));
    const baseName = _lt("Copy of %s", sheetName);
    let name = baseName.toString();
    while (names.includes(name)) {
      name = `${baseName} (${i})`;
      i++;
    }
    return name;
  }

  private deleteSheet(sheet: Sheet) {
    const name = sheet.name;
    const sheets = Object.assign({}, this.sheets);
    delete sheets[sheet.id];
    this.history.update("sheets", sheets);

    const orderedSheetIds = this.orderedSheetIds.slice();
    const currentIndex = orderedSheetIds.indexOf(sheet.id);
    orderedSheetIds.splice(currentIndex, 1);

    this.history.update("orderedSheetIds", orderedSheetIds);
    const sheetIdsMapName = Object.assign({}, this.sheetIdsMapName);
    delete sheetIdsMapName[name];
    this.history.update("sheetIdsMapName", sheetIdsMapName);
  }

  /**
   * Delete column. This requires a lot of handling:
   * - Update all the formulas in all sheets
   * - Move the cells
   * - Update the cols/rows (size, number, (cells), ...)
   * - Reevaluate the cells
   *
   * @param sheet ID of the sheet on which deletion should be applied
   * @param columns Columns to delete
   */
  private removeColumns(sheet: Sheet, columns: HeaderIndex[]) {
    // This is necessary because we have to delete elements in correct order:
    // begin with the end.
    columns.sort((a, b) => b - a);
    for (let column of columns) {
      // Move the cells.
      this.moveCellOnColumnsDeletion(sheet, column);
    }
    const numberOfCols = this.sheets[sheet.id]!.numberOfCols;
    this.history.update("sheets", sheet.id, "numberOfCols", numberOfCols - columns.length);
    const count = columns.filter((col) => col < sheet.panes.xSplit).length;
    if (count) {
      this.setPaneDivisions(sheet.id, sheet.panes.xSplit - count, "COL");
    }
  }

  /**
   * Delete row. This requires a lot of handling:
   * - Update the merges
   * - Update all the formulas in all sheets
   * - Move the cells
   * - Update the cols/rows (size, number, (cells), ...)
   * - Reevaluate the cells
   *
   * @param sheet ID of the sheet on which deletion should be applied
   * @param rows Rows to delete
   */
  private removeRows(sheet: Sheet, rows: HeaderIndex[]) {
    // This is necessary because we have to delete elements in correct order:
    // begin with the end.
    rows.sort((a, b) => b - a);

    for (let group of groupConsecutive(rows)) {
      // Move the cells.
      this.moveCellOnRowsDeletion(sheet, group[group.length - 1], group[0]);

      // Effectively delete the element and recompute the left-right/top-bottom.
      group.map((row) => this.updateRowsStructureOnDeletion(row, sheet));
    }
    const count = rows.filter((row) => row < sheet.panes.ySplit).length;
    if (count) {
      this.setPaneDivisions(sheet.id, sheet.panes.ySplit - count, "ROW");
    }
  }

  private addColumns(
    sheet: Sheet,
    column: HeaderIndex,
    position: "before" | "after",
    quantity: number
  ) {
    const index = position === "before" ? column : column + 1;
    // Move the cells.
    this.moveCellsOnAddition(sheet, index, quantity, "columns");

    const numberOfCols = this.sheets[sheet.id]!.numberOfCols;
    this.history.update("sheets", sheet.id, "numberOfCols", numberOfCols + quantity);
    if (index < sheet.panes.xSplit) {
      this.setPaneDivisions(sheet.id, sheet.panes.xSplit + quantity, "COL");
    }
  }

  private addRows(sheet: Sheet, row: HeaderIndex, position: "before" | "after", quantity: number) {
    const index = position === "before" ? row : row + 1;
    this.addEmptyRows(sheet, quantity);

    // Move the cells.
    this.moveCellsOnAddition(sheet, index, quantity, "rows");

    // Recompute the left-right/top-bottom.
    this.updateRowsStructureOnAddition(sheet, row, quantity);
    if (index < sheet.panes.ySplit) {
      this.setPaneDivisions(sheet.id, sheet.panes.ySplit + quantity, "ROW");
    }
  }

  private moveCellOnColumnsDeletion(sheet: Sheet, deletedColumn: number) {
    for (let [index, row] of Object.entries(sheet.rows)) {
      const rowIndex = parseInt(index, 10);
      for (let i in row.cells) {
        const colIndex = parseInt(i, 10);
        const cellId = row.cells[i];
        if (cellId) {
          if (colIndex === deletedColumn) {
            this.dispatch("CLEAR_CELL", {
              sheetId: sheet.id,
              col: colIndex,
              row: rowIndex,
            });
          }
          if (colIndex > deletedColumn) {
            this.dispatch("UPDATE_CELL_POSITION", {
              sheetId: sheet.id,
              cellId: cellId,
              col: colIndex - 1,
              row: rowIndex,
            });
          }
        }
      }
    }
  }

  /**
   * Move the cells after a column or rows insertion
   */
  private moveCellsOnAddition(
    sheet: Sheet,
    addedElement: HeaderIndex,
    quantity: number,
    dimension: "rows" | "columns"
  ) {
    const commands: UpdateCellPositionCommand[] = [];
    for (const [index, row] of Object.entries(sheet.rows)) {
      const rowIndex = parseInt(index, 10);
      if (dimension !== "rows" || rowIndex >= addedElement) {
        for (let i in row.cells) {
          const colIndex = parseInt(i, 10);
          const cellId = row.cells[i];
          if (cellId) {
            if (dimension === "rows" || colIndex >= addedElement) {
              commands.push({
                type: "UPDATE_CELL_POSITION",
                sheetId: sheet.id,
                cellId: cellId,
                col: colIndex + (dimension === "columns" ? quantity : 0),
                row: rowIndex + (dimension === "rows" ? quantity : 0),
              });
            }
          }
        }
      }
    }
    for (let cmd of commands.reverse()) {
      this.dispatch(cmd.type, cmd);
    }
  }

  /**
   * Move all the cells that are from the row under `deleteToRow` up to `deleteFromRow`
   *
   * b.e.
   * move vertically with delete from 3 and delete to 5 will first clear all the cells from lines 3 to 5,
   * then take all the row starting at index 6 and add them back at index 3
   *
   */
  private moveCellOnRowsDeletion(
    sheet: Sheet,
    deleteFromRow: HeaderIndex,
    deleteToRow: HeaderIndex
  ) {
    const numberRows = deleteToRow - deleteFromRow + 1;
    for (let [index, row] of Object.entries(sheet.rows)) {
      const rowIndex = parseInt(index, 10);
      if (rowIndex >= deleteFromRow && rowIndex <= deleteToRow) {
        for (let i in row.cells) {
          const colIndex = parseInt(i, 10);
          const cellId = row.cells[i];
          if (cellId) {
            this.dispatch("CLEAR_CELL", {
              sheetId: sheet.id,
              col: colIndex,
              row: rowIndex,
            });
          }
        }
      }
      if (rowIndex > deleteToRow) {
        for (let i in row.cells) {
          const colIndex = parseInt(i, 10);
          const cellId = row.cells[i];
          if (cellId) {
            this.dispatch("UPDATE_CELL_POSITION", {
              sheetId: sheet.id,
              cellId: cellId,
              col: colIndex,
              row: rowIndex - numberRows,
            });
          }
        }
      }
    }
  }

  private updateRowsStructureOnDeletion(index: HeaderIndex, sheet: Sheet) {
    const rows: Row[] = [];
    const cellsQueue = sheet.rows.map((row) => row.cells);
    for (let i in sheet.rows) {
      if (parseInt(i, 10) === index) {
        continue;
      }
      rows.push({
        cells: cellsQueue.shift()!,
      });
    }
    this.history.update("sheets", sheet.id, "rows", rows);
  }

  /**
   * Update the rows of the sheet after an addition:
   * - Rename the rows
   *
   * @param sheet Sheet on which the deletion occurs
   * @param addedRow Index of the added row
   * @param rowsToAdd Number of the rows to add
   */
  private updateRowsStructureOnAddition(sheet: Sheet, addedRow: HeaderIndex, rowsToAdd: number) {
    const rows: Row[] = [];
    const cellsQueue = sheet.rows.map((row) => row.cells);
    sheet.rows.forEach(() =>
      rows.push({
        cells: cellsQueue.shift()!,
      })
    );
    this.history.update("sheets", sheet.id, "rows", rows);
  }

  /**
   * Add empty rows at the end of the rows
   *
   * @param sheet Sheet
   * @param quantity Number of rows to add
   */
  private addEmptyRows(sheet: Sheet, quantity: number) {
    const rows: Row[] = sheet.rows.slice();
    for (let i = 0; i < quantity; i++) {
      rows.push({
        cells: {},
      });
    }
    this.history.update("sheets", sheet.id, "rows", rows);
  }

  private getImportedSheetSize(data: SheetData): { rowNumber: number; colNumber: number } {
    const positions = Object.keys(data.cells).map(toCartesian);

    let rowNumber = data.rowNumber;
    let colNumber = data.colNumber;
    for (let { col, row } of positions) {
      rowNumber = Math.max(rowNumber, row + 1);
      colNumber = Math.max(colNumber, col + 1);
    }
    return { rowNumber, colNumber };
  }

  // ----------------------------------------------------
  //  HIDE / SHOW
  // ----------------------------------------------------

  /**
   * Check that any "sheetId" in the command matches an existing
   * sheet.
   */
  private checkSheetExists(cmd: Command): CommandResult {
    if (cmd.type !== "CREATE_SHEET" && "sheetId" in cmd && this.sheets[cmd.sheetId] === undefined) {
      return CommandResult.InvalidSheetId;
    } else if (cmd.type === "CREATE_SHEET" && this.sheets[cmd.sheetId] !== undefined) {
      return CommandResult.DuplicatedSheetId;
    }
    return CommandResult.Success;
  }

  /**
   * Check if zones in the command are well formed and
   * not outside the sheet.
   */
  private checkZones(cmd: Command): CommandResult {
    const zones: Zone[] = [];
    if ("zone" in cmd) {
      zones.push(cmd.zone);
    }
    if ("target" in cmd && Array.isArray(cmd.target)) {
      zones.push(...cmd.target);
    }
    if ("ranges" in cmd && Array.isArray(cmd.ranges)) {
      zones.push(
        ...cmd.ranges.map((rangeData) => this.getters.getRangeFromRangeData(rangeData).zone)
      );
    }
    if (!zones.every(isZoneValid)) {
      return CommandResult.InvalidRange;
    } else if (zones.length && "sheetId" in cmd) {
      const sheetZone = this.getSheetZone(cmd.sheetId);
      return zones.every((zone) => isZoneInside(zone, sheetZone))
        ? CommandResult.Success
        : CommandResult.TargetOutOfSheet;
    }
    return CommandResult.Success;
  }
}

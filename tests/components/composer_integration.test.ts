import { Model } from "../../src";
import {
  DEFAULT_CELL_HEIGHT,
  DEFAULT_CELL_WIDTH,
  HEADER_HEIGHT,
  HEADER_WIDTH,
} from "../../src/constants";
import { fontSizes } from "../../src/fonts";
import { colors, toHex, toZone } from "../../src/helpers";
import {
  activateSheet,
  createSheet,
  renameSheet,
  resizeColumns,
  resizeRows,
  selectCell,
  setCellContent,
} from "../test_helpers/commands_helpers";
import {
  click,
  clickCell,
  getElComputedStyle,
  gridMouseEvent,
  keyDown,
  rightClickCell,
  selectColumnByClicking,
  simulateClick,
} from "../test_helpers/dom_helper";
import {
  getActivePosition,
  getActiveSheetFullScrollInfo,
  getCellText,
  getSelectionAnchorCellXc,
} from "../test_helpers/getters_helpers";
import {
  createEqualCF,
  mountSpreadsheet,
  nextTick,
  startGridComposition,
  toRangesData,
  typeInComposerGrid as typeInComposerGridHelper,
  typeInComposerTopBar,
} from "../test_helpers/helpers";
import { ContentEditableHelper } from "./__mocks__/content_editable_helper";

jest.mock("../../src/components/composer/content_editable_helper", () =>
  require("./__mocks__/content_editable_helper")
);

let fixture: HTMLElement;
let model: Model;
let cehMock: ContentEditableHelper;

async function startComposition(key?: string) {
  const composerEl = await startGridComposition(key);
  // @ts-ignore
  cehMock = window.mockContentHelper;
  return composerEl;
}

async function typeInComposerGrid(text: string, fromScratch: boolean = true) {
  const composerEl = await typeInComposerGridHelper(text, fromScratch);
  // @ts-ignore
  cehMock = window.mockContentHelper;
  return composerEl;
}

const modelData = { sheets: [{ id: "sh1" }] };

describe("Composer interactions", () => {
  beforeEach(async () => {
    ({ model, fixture } = await mountSpreadsheet({
      model: new Model(modelData),
    }));
  });

  test("type in grid composer adds text to topbar composer", async () => {
    await keyDown("Enter");
    const gridComposer = document.querySelector(".o-grid .o-composer");
    const topBarComposer = document.querySelector(".o-spreadsheet-topbar .o-composer");
    expect(document.activeElement).toBe(gridComposer);
    await typeInComposerGrid("text");
    expect(topBarComposer!.textContent).toBe("text");
    expect(gridComposer!.textContent).toBe("text");
  });

  test("type in topbar composer adds text to grid composer", async () => {
    await click(fixture, ".o-spreadsheet-topbar .o-composer");
    const topBarComposer = document.querySelector(".o-spreadsheet-topbar .o-composer");
    const gridComposer = document.querySelector(".o-grid .o-composer");
    expect(topBarComposer).not.toBeNull();
    expect(document.activeElement).toBe(topBarComposer);
    expect(gridComposer).not.toBeNull();
    await typeInComposerTopBar("text");
    expect(topBarComposer!.textContent).toBe("text");
    expect(gridComposer!.textContent).toBe("text");
  });

  test("start typing in topbar composer then continue in grid composer", async () => {
    await click(fixture, ".o-spreadsheet-topbar .o-composer");
    const topBarComposer = document.querySelector(".o-spreadsheet-topbar .o-composer");
    const gridComposer = document.querySelector(".o-grid .o-composer");

    // Type in top bar composer
    await typeInComposerTopBar("from topbar");
    expect(topBarComposer!.textContent).toBe("from topbar");
    expect(gridComposer!.textContent).toBe("from topbar");

    // Focus grid composer and type
    await click(fixture, ".o-grid .o-composer");
    await typeInComposerGrid("from grid");
    expect(topBarComposer!.textContent).toBe("from topbarfrom grid");
    expect(gridComposer!.textContent).toBe("from topbarfrom grid");
  });

  test("top bar composer display active cell content", async () => {
    setCellContent(model, "A2", "Hello");
    selectCell(model, "A2");
    await nextTick();
    const topBarComposer = document.querySelector(".o-spreadsheet-topbar .o-composer");
    expect(topBarComposer!.textContent).toBe("Hello");
  });

  test("top bar composer displays formatted date cell content", async () => {
    setCellContent(model, "A2", "10/10/2021");
    selectCell(model, "A2");
    await nextTick();
    const topBarComposer = document.querySelector(".o-spreadsheet-topbar .o-composer")!;
    expect(topBarComposer.textContent).toBe("10/10/2021");
    // Focus top bar composer
    await click(topBarComposer);
    expect(topBarComposer!.textContent).toBe("10/10/2021");
  });

  test("autocomplete disappear when grid composer is blurred", async () => {
    await keyDown("Enter");
    const topBarComposer = document.querySelector(".o-spreadsheet-topbar .o-composer")!;
    await typeInComposerGrid("=SU");
    expect(fixture.querySelector(".o-grid .o-autocomplete-dropdown")).not.toBeNull();
    await click(topBarComposer);
    expect(fixture.querySelector(".o-grid .o-autocomplete-dropdown")).toBeNull();
  });

  test("focus top bar composer does not resize grid composer when autocomplete is displayed", async () => {
    await keyDown("Enter");
    const topBarComposer = document.querySelector(".o-spreadsheet-topbar .o-composer")!;
    const gridComposerContainer = document.querySelector(".o-grid-composer")! as HTMLElement;
    const spy = jest.spyOn(gridComposerContainer.style, "width", "set");
    await typeInComposerGrid("=SU");
    await nextTick();
    await click(topBarComposer);
    expect(document.activeElement).toBe(topBarComposer);
    expect(spy).not.toHaveBeenCalled();
  });

  test("selecting ranges multiple times in topbar bar does not resize grid composer", async () => {
    await click(fixture, ".o-spreadsheet-topbar .o-composer");
    const gridComposerContainer = document.querySelector(".o-grid-composer")! as HTMLElement;
    // Type in top bar composer
    await typeInComposerTopBar("=");
    const spy = jest.spyOn(gridComposerContainer.style, "width", "set");
    await nextTick();
    selectCell(model, "B2");
    await nextTick();
    selectCell(model, "B2");
    await nextTick();
    expect(spy).not.toHaveBeenCalled();
  });

  test("Selecting a range should not scroll the viewport to the current Grid selection", async () => {
    const { top, bottom, left, right } = model.getters.getActiveMainViewport();
    await typeInComposerTopBar("=");
    // scroll
    fixture
      .querySelector(".o-grid")!
      .dispatchEvent(new WheelEvent("wheel", { deltaY: 3 * DEFAULT_CELL_HEIGHT }));
    await nextTick();
    const scrolledViewport = model.getters.getActiveMainViewport();
    expect(scrolledViewport).toMatchObject({
      left,
      right,
      top: top + 3,
      bottom: bottom + 3,
    });
    expect(getActiveSheetFullScrollInfo(model)).toMatchObject({
      scrollY: 3 * DEFAULT_CELL_HEIGHT,
      scrollbarScrollY: 3 * DEFAULT_CELL_HEIGHT,
    });
    await clickCell(model, "E5");
    expect(model.getters.getSelectedZones()).toEqual([toZone("A1")]);
    expect(model.getters.getActiveMainViewport()).toMatchObject(scrolledViewport);
  });

  test("type '=' and click Cell, the cell ref should be colored", async () => {
    const composerEl = await typeInComposerGrid("=");
    expect(composerEl.textContent).toBe("=");
    expect(cehMock.selectionState.isSelectingRange).toBeTruthy();
    expect(cehMock.selectionState.position).toBe(1);
    expect(model.getters.getEditionMode()).toBe("selecting");
    await clickCell(model, "C8");
    expect(composerEl.textContent).toBe("=C8");
    expect(cehMock.colors["C8"]).toBe(colors[0]);
  });

  test("=+Click range, the range ref should be colored", async () => {
    const composerEl = await typeInComposerGrid("=");
    gridMouseEvent(model, "mousedown", "C8");
    gridMouseEvent(model, "mousemove", "B8");
    gridMouseEvent(model, "mouseup", "B8");
    await nextTick();
    expect(composerEl.textContent).toBe("=B8:C8");
    expect(cehMock.colors["B8:C8"]).toBe(colors[0]);
  });

  test("type '=', and click a cell several times", async () => {
    const composerEl = await typeInComposerGrid("=");
    await clickCell(model, "C8");
    await clickCell(model, "C8");
    expect(composerEl.textContent).toBe("=C8");
    await clickCell(model, "C7");
    expect(composerEl.textContent).toBe("=C7");
  });

  test("starting the edition with enter, the composer should have the focus", async () => {
    await startComposition();
    expect(model.getters.getEditionMode()).toBe("editing");
    expect(getActivePosition(model)).toBe("A1");
    expect(document.activeElement).toBe(fixture.querySelector(".o-grid div.o-composer")!);
  });

  test("Starting the edition should not display the cell reference", async () => {
    await startComposition();
    expect(fixture.querySelector(".o-grid div.o-cell-reference")).toBeNull();
  });

  test("Starting the edition and scroll should display the cell reference", async () => {
    await startComposition();
    model.dispatch("SET_VIEWPORT_OFFSET", {
      offsetX: 0,
      offsetY: DEFAULT_CELL_HEIGHT * 5,
    });
    await nextTick();
    const reference = fixture.querySelector(".o-grid div.o-cell-reference");
    expect(reference).not.toBeNull();
    expect(reference!.textContent).toBe("A1");
  });

  test("Starting the edition and change sheet should display the cell reference with the sheet name", async () => {
    createSheet(model, { sheetId: "sheet2" });
    await startComposition("=");
    activateSheet(model, "sheet2");
    await nextTick();
    const reference = fixture.querySelector(".o-grid div.o-cell-reference");
    expect(reference).not.toBeNull();
    expect(reference!.textContent).toBe("Sheet1!A1");
  });

  test("Starting the edition and change sheet should display the cell reference with the sheet name, with quotes if needed", async () => {
    renameSheet(model, model.getters.getActiveSheetId(), "My beautiful name");
    createSheet(model, { sheetId: "sheet2" });
    await startComposition("=");
    activateSheet(model, "sheet2");
    await nextTick();
    const reference = fixture.querySelector(".o-grid div.o-cell-reference");
    expect(reference).not.toBeNull();
    expect(reference!.textContent).toBe("'My beautiful name'!A1");
  });

  test("starting the edition with a key stroke =, the composer should have the focus after the key input", async () => {
    const composerEl = await startComposition("=");
    expect(composerEl.textContent).toBe("=");
    expect(document.activeElement).toBe(composerEl);
  });

  test("starting the edition with a key stroke B, the composer should have the focus after the key input", async () => {
    const composerEl = await startComposition("b");
    expect(composerEl.textContent).toBe("b");
    expect(document.activeElement).toBe(composerEl);
  });

  test("type '=', backspace and select a cell should not add it", async () => {
    const composerEl = await typeInComposerGrid("=");
    model.dispatch("SET_CURRENT_CONTENT", { content: "" });
    cehMock.removeAll();
    composerEl.dispatchEvent(new Event("input"));
    composerEl.dispatchEvent(new Event("keyup"));
    await clickCell(model, "C8");
    expect(getSelectionAnchorCellXc(model)).toBe("C8");
    expect(fixture.querySelectorAll(".o-grid div.o-composer")).toHaveLength(0);
  });

  test("ArrowKeys will move to neighbour cell, if not in contentFocus mode (left/right)", async () => {
    let composerEl: Element;
    composerEl = await startComposition("a");
    expect(composerEl.textContent).toBe("a");
    await keyDown("ArrowRight");
    expect(getCellText(model, "A1")).toBe("a");
    expect(getActivePosition(model)).toBe("B1");

    composerEl = await startComposition("b");
    expect(composerEl.textContent).toBe("b");
    await keyDown("ArrowRight");
    expect(getCellText(model, "B1")).toBe("b");
    expect(getActivePosition(model)).toBe("C1");

    await keyDown("ArrowLeft");
    expect(getActivePosition(model)).toBe("B1");
    await keyDown("ArrowLeft");
    expect(getActivePosition(model)).toBe("A1");
    composerEl = await startComposition("c");
    expect(composerEl.textContent).toBe("c");
    await keyDown("Enter");
    expect(getCellText(model, "B1")).toBe("b");
    expect(getCellText(model, "A1")).toBe("c");
  });

  test("Arrow keys will not move to neighbor cell when a formula", async () => {
    let composerEl: Element;
    composerEl = await startComposition("=");
    await typeInComposerGrid(`"`);
    await typeInComposerGrid(`"`);
    expect(composerEl.textContent).toBe(`=""`);
    await keyDown("ArrowLeft");
    expect(model.getters.getEditionMode()).not.toBe("inactive");
  });

  test("ArrowKeys will move to neighbour cell, if not in contentFocus mode (up/down)", async () => {
    let composerEl: Element;
    composerEl = await startComposition("a");
    expect(composerEl.textContent).toBe("a");
    await keyDown("ArrowDown");
    expect(getCellText(model, "A1")).toBe("a");
    expect(getActivePosition(model)).toBe("A2");

    composerEl = await startComposition("b");
    expect(composerEl.textContent).toBe("b");
    await keyDown("ArrowDown");
    expect(getCellText(model, "A2")).toBe("b");
    expect(getActivePosition(model)).toBe("A3");

    await keyDown("ArrowUp");
    expect(getActivePosition(model)).toBe("A2");
    await keyDown("ArrowUp");
    expect(getActivePosition(model)).toBe("A1");
    composerEl = await startComposition("c");
    expect(composerEl.textContent).toBe("c");
    await keyDown("Enter");
    expect(getCellText(model, "A2")).toBe("b");
    expect(getCellText(model, "A1")).toBe("c");
  });

  test("The composer should be closed before opening the context menu", async () => {
    await typeInComposerGrid("=");
    await rightClickCell(model, "C8");
    expect(model.getters.getEditionMode()).toBe("inactive");
    expect(fixture.querySelectorAll(".o-grid div.o-composer")).toHaveLength(0);
  });

  test("The composer should be closed before selecting headers", async () => {
    await typeInComposerGrid("Hello");
    expect(fixture.querySelectorAll(".o-grid div.o-composer")).toHaveLength(1);
    await selectColumnByClicking(model, "C");
    expect(fixture.querySelectorAll(".o-grid div.o-composer")).toHaveLength(0);
  });

  test("The content in the composer should be kept after selecting headers", async () => {
    await clickCell(model, "C8");
    await typeInComposerGrid("Hello");
    await selectColumnByClicking(model, "C");
    expect(getCellText(model, "C8")).toBe("Hello");
  });

  test("typing CTRL+C in grid does not type C in the cell", async () => {
    await keyDown("c", { ctrlKey: true });
    expect(model.getters.getCurrentContent()).toBe("");
  });

  test("Hitting enter on topbar composer will properly update it", async () => {
    setCellContent(model, "A1", "I am Tabouret");
    setCellContent(model, "A2", "wooplaburg");
    await clickCell(model, "A1");
    const topbarComposerElement = fixture.querySelector(
      ".o-spreadsheet-topbar .o-composer-container div"
    )!;
    expect(topbarComposerElement.textContent).toBe("I am Tabouret");
    await simulateClick(topbarComposerElement);
    await keyDown("Enter");
    expect(topbarComposerElement.textContent).toBe("wooplaburg");
  });

  test("Grid taking focus over topbar composer will properly update the latter", async () => {
    setCellContent(model, "A1", "I am Tabouret");
    await clickCell(model, "A1");
    const topbarComposerElement = fixture.querySelector(
      ".o-spreadsheet-topbar .o-composer-container div"
    )!;
    expect(topbarComposerElement.textContent).toBe("I am Tabouret");
    await simulateClick(topbarComposerElement); // gain focus on topbar composer
    await keyDown("ArrowLeft");
    await simulateClick(".o-grid-overlay", 300, 200); // focus another Cell (i.e. C8)
    expect(topbarComposerElement.textContent).toBe("");
  });

  test("focus topbar composer then focus grid composer", async () => {
    const topbarComposerElement = fixture.querySelector(
      ".o-spreadsheet-topbar .o-composer-container div"
    )!;
    await simulateClick(topbarComposerElement);
    expect(document.activeElement).toBe(topbarComposerElement);
    const gridComposerElement = fixture.querySelector(".o-grid .o-composer-container div")!;
    await simulateClick(gridComposerElement);
    expect(document.activeElement).toBe(gridComposerElement);
  });
});

describe("Grid composer", () => {
  beforeEach(async () => {
    ({ model, fixture } = await mountSpreadsheet({
      model: new Model(modelData),
    }));
  });

  test("Composer is closed when changing sheet while not editing a formula", async () => {
    const baseSheetId = model.getters.getActiveSheetId();
    createSheet(model, { sheetId: "42", name: "Sheet2" });
    await nextTick();

    // Editing text
    await typeInComposerGrid("hey");
    expect(fixture.querySelector(".o-grid .o-composer")).toBeTruthy();
    activateSheet(model, "42");
    await nextTick();
    expect(fixture.querySelector(".o-grid .o-composer")).toBeFalsy();

    // Editing formula
    await typeInComposerGrid("=");
    expect(fixture.querySelector(".o-grid .o-composer")).toBeTruthy();
    activateSheet(model, baseSheetId);
    await nextTick();
    expect(fixture.querySelector(".o-grid .o-composer")).toBeTruthy();
  });

  test("the composer should keep the focus after changing sheet", async () => {
    createSheet(model, { sheetId: "42", name: "Sheet2" });
    await nextTick();

    await startComposition("=");
    expect(document.activeElement).toBe(fixture.querySelector(".o-grid div.o-composer")!);
    await simulateClick(fixture.querySelectorAll(".o-sheet")[1]);
    expect(model.getters.getActiveSheetId()).toEqual("42");
    expect(document.activeElement).toBe(fixture.querySelector(".o-grid div.o-composer")!);
  });

  describe("grid composer basic style", () => {
    const composerContainerSelector = ".o-grid .o-grid-composer";
    const composerSelector = composerContainerSelector + " .o-composer";

    test("Grid composer snapshot", async () => {
      await typeInComposerGrid("A");
      expect(fixture.querySelector(composerContainerSelector)).toMatchSnapshot();
    });

    test("Grid composer container is positioned over the edited cell", async () => {
      selectCell(model, "C3");
      await typeInComposerGrid("A");

      const expectedTop = HEADER_HEIGHT + 2 * DEFAULT_CELL_HEIGHT;
      const expectedLeft = HEADER_WIDTH + 2 * DEFAULT_CELL_WIDTH - 1; //-1 to include cell border

      expect(getElComputedStyle(composerContainerSelector, "top")).toBe(expectedTop + "px");
      expect(getElComputedStyle(composerContainerSelector, "left")).toBe(expectedLeft + "px");
    });

    test("Grid composer container have a min-height / min-width to have the same size as the edited cell ", async () => {
      resizeRows(model, [0], 40);
      resizeColumns(model, ["A"], 50);
      await typeInComposerGrid("A");

      let expectedMinHeight = 40 + 1; // +1 to include cell border
      let expectedMinWidth = 50 + 1;

      expect(getElComputedStyle(composerContainerSelector, "min-height")).toBe(
        expectedMinHeight + "px"
      );
      expect(getElComputedStyle(composerContainerSelector, "min-width")).toBe(
        expectedMinWidth + "px"
      );
    });

    test("Grid composer have a max-height / max-width to avoid overflow outside of grid", async () => {
      selectCell(model, "C3");
      await typeInComposerGrid("A");

      const sheetViewDims = model.getters.getSheetViewDimension();
      const expectedMaxHeight = sheetViewDims.height - 2 * DEFAULT_CELL_HEIGHT;
      const expectedMaxWidth = sheetViewDims.width - 2 * DEFAULT_CELL_WIDTH;

      expect(getElComputedStyle(composerSelector, "max-height")).toBe(expectedMaxHeight + "px");
      expect(getElComputedStyle(composerSelector, "max-width")).toBe(expectedMaxWidth + "px");
    });
  });

  describe("Grid composer's style depends on the style of the cell when containing text", () => {
    test("Inherits the style of the cell", async () => {
      const fontSize = fontSizes[0];
      const color = "#123456";
      model.dispatch("SET_FORMATTING", {
        sheetId: model.getters.getActiveSheetId(),
        target: [toZone("A1")],
        style: {
          textColor: color,
          fillColor: color,
          fontSize: fontSize.pt,
          bold: true,
          italic: true,
          strikethrough: true,
          underline: true,
          align: "right",
        },
      });
      await typeInComposerGrid("Hello");
      const gridComposer = fixture.querySelector(".o-grid-composer")! as HTMLElement;
      expect(toHex(gridComposer.style.color)).toBe(color);
      expect(toHex(gridComposer.style.background)).toBe(color);
      expect(gridComposer.style.fontSize).toBe("10px");
      expect(gridComposer.style.fontWeight).toBe("bold");
      expect(gridComposer.style.fontStyle).toBe("italic");
      expect(gridComposer.style.textDecoration).toBe("line-through underline");
      expect(gridComposer.style.textAlign).toBe("right");
    });

    test("Inherits CF formatting of the cell", async () => {
      const sheetId = model.getters.getActiveSheetId();
      model.dispatch("ADD_CONDITIONAL_FORMAT", {
        cf: createEqualCF(
          "4",
          {
            fillColor: "#0000FF",
            bold: true,
            italic: true,
            strikethrough: true,
            underline: true,
            textColor: "#FF0000",
          },
          "cfId"
        ),
        ranges: toRangesData(sheetId, "A1"),
        sheetId,
      });
      setCellContent(model, "A1", "4");
      await typeInComposerGrid("Hello");
      const gridComposer = fixture.querySelector(".o-grid-composer")! as HTMLElement;
      expect(gridComposer.style.textDecoration).toBe("line-through underline");
      expect(gridComposer.style.fontWeight).toBe("bold");
      expect(toHex(gridComposer.style.background)).toBe("#0000FF");
      expect(toHex(gridComposer.style.color)).toBe("#FF0000");
    });
  });

  describe("grid composer's style does not depend on the style of the cell when containing a formula", () => {
    test("Does not inherit style of the cell", async () => {
      const fontSize = fontSizes[0];
      const color = "#123456";
      model.dispatch("SET_FORMATTING", {
        sheetId: model.getters.getActiveSheetId(),
        target: [toZone("A1")],
        style: {
          textColor: color,
          fillColor: color,
          fontSize: fontSize.pt,
          bold: true,
          italic: true,
          strikethrough: true,
          underline: true,
          align: "right",
        },
      });
      await typeInComposerGrid("=");
      const gridComposer = fixture.querySelector(".o-grid-composer")! as HTMLElement;
      expect(toHex(gridComposer.style.color)).toBe("#000000");
      expect(toHex(gridComposer.style.background)).toBe("#FFFFFF");
      expect(gridComposer.style.fontSize).toBe("13px");
      expect(gridComposer.style.fontWeight).toBe("500");
      expect(gridComposer.style.fontStyle).toBe("normal");
      expect(gridComposer.style.textDecoration).toBe("none");
      expect(gridComposer.style.textAlign).toBe("left");
    });

    test("Does not inherit CF formatting of the cell", async () => {
      const sheetId = model.getters.getActiveSheetId();
      model.dispatch("ADD_CONDITIONAL_FORMAT", {
        cf: {
          id: "cfId",
          rule: {
            values: [],
            type: "CellIsRule",
            operator: "IsNotEmpty",
            style: {
              fillColor: "#0000FF",
              bold: true,
              italic: true,
              strikethrough: true,
              underline: true,
              textColor: "#FF0000",
            },
          },
        },
        ranges: toRangesData(sheetId, "A1"),
        sheetId,
      });
      await typeInComposerGrid("=", true);
      const gridComposer = fixture.querySelector(".o-grid-composer")! as HTMLElement;
      expect(gridComposer.style.textDecoration).toBe("none");
      expect(gridComposer.style.fontWeight).toBe("500");
      expect(toHex(gridComposer.style.color)).toBe("#000000");
      expect(toHex(gridComposer.style.background)).toBe("#FFFFFF");
    });
  });
});

import { args, functionRegistry } from "../../src/functions/index";
import { Model } from "../../src/model";
import { selectCell } from "../test_helpers/commands_helpers";
import { click, clickCell, keyDown, keyUp, simulateClick } from "../test_helpers/dom_helper";
import { getCellText } from "../test_helpers/getters_helpers";
import {
  clearFunctions,
  mountSpreadsheet,
  nextTick,
  restoreDefaultFunctions,
  typeInComposerGrid as typeInComposerGridHelper,
  typeInComposerTopBar as typeInComposerTopBarHelper,
} from "../test_helpers/helpers";
import { ContentEditableHelper } from "./__mocks__/content_editable_helper";
jest.mock("../../src/components/composer/content_editable_helper", () =>
  require("./__mocks__/content_editable_helper")
);

let model: Model;
let composerEl: Element;
let fixture: HTMLElement;
let cehMock: ContentEditableHelper;

async function typeInComposerGrid(text: string, fromScratch: boolean = true) {
  const composerEl = await typeInComposerGridHelper(text, fromScratch);
  // @ts-ignore
  cehMock = window.mockContentHelper;
  return composerEl;
}

async function typeInComposerTopBar(text: string, fromScratch: boolean = true) {
  const composerEl = await typeInComposerTopBarHelper(text, fromScratch);
  // @ts-ignore
  cehMock = window.mockContentHelper;
  return composerEl;
}

beforeEach(async () => {
  ({ model, fixture } = await mountSpreadsheet());

  // start composition
  await keyDown("Enter");
  composerEl = fixture.querySelector(".o-grid div.o-composer")!;
});

describe("Functions autocomplete", () => {
  beforeEach(() => {
    clearFunctions();
    functionRegistry.add("IF", {
      description: "do if",
      args: args(``),
      compute: () => 1,
      returns: ["ANY"],
    });
    functionRegistry.add("SUM", {
      description: "do sum",
      args: args(``),
      compute: () => 1,
      returns: ["ANY"],
    });
    functionRegistry.add("SZZ", {
      description: "do something",
      args: args(``),
      compute: () => 1,
      returns: ["ANY"],
    });
    functionRegistry.add("HIDDEN", {
      description: "do something",
      args: args(``),
      compute: () => 1,
      returns: ["ANY"],
      hidden: true,
    });
  });

  afterAll(() => {
    restoreDefaultFunctions();
  });

  describe("autocomplete", () => {
    test("= do not show autocomplete", async () => {
      await typeInComposerGrid("=");
      const activeElement = document.activeElement;
      expect(activeElement).toBe(composerEl);
      expect(fixture.querySelectorAll(".o-autocomplete-value")).toHaveLength(0);
    });

    test("=HI do not show autocomplete when entering hidden function names", async () => {
      await typeInComposerGrid("=HI");
      const activeElement = document.activeElement;
      expect(activeElement).toBe(composerEl);
      expect(fixture.querySelectorAll(".o-autocomplete-value")).toHaveLength(0);
    });

    test("simple snapshot with =S", async () => {
      await typeInComposerGrid("=S");
      expect(fixture.querySelector(".o-autocomplete-dropdown")).toMatchSnapshot();
    });

    test("=S show autocomplete functions starting with S", async () => {
      await typeInComposerGrid("=S");
      expect(fixture.querySelectorAll(".o-autocomplete-value")).toHaveLength(2);
      expect(fixture.querySelectorAll(".o-autocomplete-value")[0].textContent).toBe("SUM");
      expect(fixture.querySelectorAll(".o-autocomplete-value")[1].textContent).toBe("SZZ");
    });

    test("=S+TAB complete the function --> =SUM(␣", async () => {
      await typeInComposerGrid("=S");
      await keyDown("Tab");
      expect(composerEl.textContent).toBe("=SUM(");
      expect(cehMock.selectionState.isSelectingRange).toBeTruthy();
      expect(cehMock.selectionState.position).toBe(5);
    });

    test("=S+ENTER complete the function --> =SUM(␣", async () => {
      await typeInComposerGrid("=S");
      await keyDown("Enter");
      expect(composerEl.textContent).toBe("=SUM(");
      expect(cehMock.selectionState.isSelectingRange).toBeTruthy();
      expect(cehMock.selectionState.position).toBe(5);
    });

    test("=SX not show autocomplete (nothing matches SX)", async () => {
      await typeInComposerGrid("=SX");
      expect(fixture.querySelectorAll(".o-autocomplete-value")).toHaveLength(0);
    });

    test("=SX+ENTER does not autocomplete anything and moves to the cell down", async () => {
      await typeInComposerGrid("=SX");
      await keyDown("Tab");
      expect(getCellText(model, "A1")).toBe("=SX");
    });

    test("=S+UP cycle to the last item", async () => {
      await typeInComposerGrid("=S");
      expect(
        fixture.querySelector(".o-autocomplete-value-focus .o-autocomplete-value")!.textContent
      ).toBe("SUM");
      await keyDown("ArrowUp");
      expect(
        fixture.querySelector(".o-autocomplete-value-focus .o-autocomplete-value")!.textContent
      ).toBe("SZZ");
    });

    test("=+DOWN+UP move to next/previous autocomplete", async () => {
      await typeInComposerGrid("=S");
      expect(
        fixture.querySelector(".o-autocomplete-value-focus .o-autocomplete-value")!.textContent
      ).toBe("SUM");
      await keyDown("ArrowDown");
      expect(
        fixture.querySelector(".o-autocomplete-value-focus .o-autocomplete-value")!.textContent
      ).toBe("SZZ");
      await keyDown("ArrowUp");
      expect(
        fixture.querySelector(".o-autocomplete-value-focus .o-autocomplete-value")!.textContent
      ).toBe("SUM");
    });

    test("=+DOWN+DOWN cycle to the first item", async () => {
      await typeInComposerGrid("=S");
      expect(
        fixture.querySelector(".o-autocomplete-value-focus .o-autocomplete-value")!.textContent
      ).toBe("SUM");
      await keyDown("ArrowDown");
      expect(
        fixture.querySelector(".o-autocomplete-value-focus .o-autocomplete-value")!.textContent
      ).toBe("SZZ");
      await keyDown("ArrowDown");
      expect(
        fixture.querySelector(".o-autocomplete-value-focus .o-autocomplete-value")!.textContent
      ).toBe("SUM");
    });

    test("autocomplete restrict number of proposition to 10", async () => {
      for (let i = 0; i < 20; i++) {
        functionRegistry.add(`SUM${i + 1}`, {
          description: "do sum",
          args: args(``),
          compute: () => 1,
          returns: ["ANY"],
        });
      }

      await typeInComposerGrid("=S");
      expect(fixture.querySelectorAll(".o-autocomplete-value")).toHaveLength(10);
    });

    test("click on a autocomplete does the autocomplete", async () => {
      await typeInComposerGrid("=S");
      await click(fixture, ".o-autocomplete-dropdown > div:nth-child(2)");
      expect(composerEl.textContent).toBe("=SZZ(");
      expect(cehMock.selectionState.isSelectingRange).toBeTruthy();
      expect(cehMock.selectionState.position).toBe(5);
      expect(document.activeElement).toBe(composerEl);
      expect(fixture.querySelectorAll(".o-autocomplete-value")).toHaveLength(0);
    });

    test("autocomplete fuzzy search", async () => {
      for (const f of ["TEST_FUZZY", "FUZZY", "FUZZY_TEST", "TEST_FUZZY_TEST"]) {
        functionRegistry.add(f, {
          description: "",
          args: args(``),
          compute: () => 1,
          returns: ["ANY"],
        });
      }
      await typeInComposerGrid("=FUZZY");
      expect(fixture.querySelectorAll(".o-autocomplete-value")).toHaveLength(4);
      expect(fixture.querySelectorAll(".o-autocomplete-value")[0].textContent).toBe("FUZZY");
      expect(fixture.querySelectorAll(".o-autocomplete-value")[1].textContent).toBe("FUZZY_TEST");
      expect(fixture.querySelectorAll(".o-autocomplete-value")[2].textContent).toBe("TEST_FUZZY");
      expect(fixture.querySelectorAll(".o-autocomplete-value")[3].textContent).toBe(
        "TEST_FUZZY_TEST"
      );
    });

    test("click on a autocomplete with multi-line topbar composer does the autocomplete", async () => {
      await typeInComposerTopBar("=\nS");
      await click(fixture, ".o-autocomplete-dropdown > div:nth-child(2)");
      expect(composerEl.textContent).toBe("=\nSZZ(");
      expect(cehMock.selectionState.isSelectingRange).toBeTruthy();
      expect(cehMock.selectionState.position).toBe(6);
      expect(document.activeElement).toBe(composerEl);
      expect(fixture.querySelectorAll(".o-autocomplete-value")).toHaveLength(0);
    });

    test("Mouse events on the autocomplete dropdown don't make the composer lose focus", async () => {
      await typeInComposerGrid("=S");
      const activeElement = document.activeElement;
      expect(activeElement?.classList).toContain("o-composer");

      const dropDownEl = fixture.querySelector(".o-autocomplete-dropdown")!;

      await nextTick();
      expect(document.activeElement).toEqual(activeElement);

      dropDownEl.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      await nextTick();
      expect(document.activeElement).toEqual(activeElement);

      dropDownEl.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await nextTick();
      expect(document.activeElement).toEqual(activeElement);

      await click(dropDownEl);
      expect(document.activeElement).toEqual(activeElement);
    });
  });

  describe("autocomplete functions SUM IF", () => {
    test("empty not show autocomplete", async () => {
      await typeInComposerGrid("");
      expect(document.activeElement).toBe(composerEl);
      expect(fixture.querySelectorAll(".o-autocomplete-value")).toHaveLength(0);
    });
    test("=a3 not show autocomplete (its a ref)", async () => {
      await typeInComposerGrid("=a3");
      expect(document.activeElement).toBe(composerEl);
      expect(fixture.querySelectorAll(".o-autocomplete-value")).toHaveLength(0);
    });
    test("=a3+ does not show autocomplete (we didn't start typing on the next token", async () => {
      await typeInComposerGrid("=a3+");
      expect(document.activeElement).toBe(composerEl);
      expect(fixture.querySelectorAll(".o-autocomplete-value")).toHaveLength(0);
    });
    test("=sum(s show autocomplete", async () => {
      await typeInComposerGrid("=sum(s");
      expect(document.activeElement).toBe(composerEl);
      expect(fixture.querySelectorAll(".o-autocomplete-value")).toHaveLength(2);
    });
    test("= and CTRL+Space show autocomplete", async () => {
      await typeInComposerGrid("=");
      await keyUp(" ", { ctrlKey: true });
      //TODO Need a second nextTick to wait the re-render of SelectionInput (onMounted => uuid assignation). But why not before ?
      await nextTick();
      expect(fixture.querySelectorAll(".o-autocomplete-value")).toHaveLength(3);
      await keyDown("Tab");
      expect(composerEl.textContent).toBe("=IF(");
      expect(cehMock.selectionState.isSelectingRange).toBeTruthy();
      expect(cehMock.selectionState.position).toBe(4);
    });
    test("= and CTRL+Space & DOWN move to next autocomplete", async () => {
      await typeInComposerGrid("=");
      await keyUp(" ", { ctrlKey: true });
      await keyDown("ArrowDown");
      expect(
        fixture.querySelector(".o-autocomplete-value-focus .o-autocomplete-value")!.textContent
      ).toBe("SUM");
    });
  });
});

describe("Autocomplete parenthesis", () => {
  beforeAll(() => {
    clearFunctions();
    functionRegistry.add("IF", {
      description: "do if",
      args: args(``),
      compute: () => 1,
      returns: ["ANY"],
    });
    functionRegistry.add("SUM", {
      description: "do sum",
      args: args(``),
      compute: () => 1,
      returns: ["ANY"],
    });
    functionRegistry.add("SZZ", {
      description: "do something",
      args: args(``),
      compute: () => 1,
      returns: ["ANY"],
    });
  });

  afterAll(() => {
    restoreDefaultFunctions();
  });

  test("=sum(1,2 + enter adds closing parenthesis", async () => {
    await typeInComposerGrid("=sum(1,2");
    await keyDown("Enter");
    expect(getCellText(model, "A1")).toBe("=sum(1,2)");
  });

  test("=sum(1,2) + enter + edit sum does not add parenthesis", async () => {
    await typeInComposerGrid("=sum(1,2)");
    await keyDown("Enter");
    selectCell(model, "A1");
    //edit A1
    await keyDown("Enter");
    composerEl = fixture.querySelector(".o-grid div.o-composer")!;

    model.dispatch("CHANGE_COMPOSER_CURSOR_SELECTION", { start: 1, end: 4 });
    await nextTick();
    await typeInComposerGrid("if");
    expect(model.getters.getCurrentContent()).toBe("=if(1,2)");
  });

  test("=S( + edit S with autocomplete does not add left parenthesis", async () => {
    await typeInComposerGrid("=S(");
    // go behind the letter "S"
    model.dispatch("STOP_COMPOSER_RANGE_SELECTION");
    model.dispatch("CHANGE_COMPOSER_CURSOR_SELECTION", { start: 2, end: 2 });
    await nextTick();
    // show autocomplete
    await typeInComposerGrid("U", false);
    expect(model.getters.getCurrentContent()).toBe("=SU(");
    expect(model.getters.getComposerSelection()).toEqual({ start: 3, end: 3 });
    expect(document.activeElement).toBe(composerEl);
    expect(fixture.querySelectorAll(".o-autocomplete-value")).toHaveLength(1);
    // select the SUM function
    await simulateClick(fixture.querySelector(".o-autocomplete-value")!);
    expect(composerEl.textContent).toBe("=SUM(");
    expect(cehMock.selectionState.isSelectingRange).toBeTruthy();
    expect(cehMock.selectionState.position).toBe(5);
    expect(model.getters.getComposerSelection()).toEqual({ start: 5, end: 5 });
  });

  test("=sum(sum(1,2 + enter add 2 closing parenthesis", async () => {
    await typeInComposerGrid("=sum(sum(1,2");
    await keyDown("Enter");
    expect(getCellText(model, "A1")).toBe("=sum(sum(1,2))");
  });

  test("=sum(sum(1,2) + enter add 1 closing parenthesis", async () => {
    await typeInComposerGrid("=sum(sum(1,2");
    await keyDown("Enter");
    expect(getCellText(model, "A1")).toBe("=sum(sum(1,2))");
  });

  test("=sum(sum(1,2) + click outside composer should add the missing parenthesis", async () => {
    await typeInComposerGrid("=sum(sum(1,2");
    await clickCell(model, "B2");
    expect(getCellText(model, "A1")).toBe("=sum(sum(1,2))");
  });

  test('=sum("((((((((") + enter should not complete the parenthesis in the string', async () => {
    await typeInComposerGrid('=sum("((((((((")');
    await keyDown("Enter");
    expect(getCellText(model, "A1")).toBe('=sum("((((((((")');
  });

  test("=s + tab should allow to select a ref", async () => {
    await typeInComposerGrid("=s");
    await keyDown("Tab");
    expect(model.getters.getEditionMode()).toBe("selecting");
  });
});

describe("autocomplete parameters", () => {});
describe("custom autocomplete", () => {});

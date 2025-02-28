import { Component, useSubEnv, xml } from "@odoo/owl";
import { Menu } from "../../src/components/menu/menu";
import { MENU_ITEM_HEIGHT, MENU_VERTICAL_PADDING, MENU_WIDTH } from "../../src/constants";
import { toXC } from "../../src/helpers";
import { Model } from "../../src/model";
import { cellMenuRegistry } from "../../src/registries/menus/cell_menu_registry";
import { createMenu, MenuItem } from "../../src/registries/menu_items_registry";
import { MockClipboard } from "../test_helpers/clipboard";
import { setCellContent } from "../test_helpers/commands_helpers";
import {
  click,
  keyDown,
  rightClickCell,
  simulateClick,
  triggerMouseEvent,
} from "../test_helpers/dom_helper";
import { getCell, getCellContent, getEvaluatedCell } from "../test_helpers/getters_helpers";
import {
  getStylePropertyInPx,
  mountComponent,
  mountSpreadsheet,
  nextTick,
  Touch,
} from "../test_helpers/helpers";
import { mockGetBoundingClientRect } from "../test_helpers/mock_helpers";

let fixture: HTMLElement;
let model: Model;

mockGetBoundingClientRect({
  "o-menu": (el) => getElPosition(el),
  "o-popover": (el) => {
    const childName = (el.firstChild?.firstChild as HTMLElement)?.title;
    if (childName && childName.includes("subMenu")) {
      return getSubMenuSize();
    }
    return getMenuSize();
  },
  "o-spreadsheet": () => ({ top: 0, left: 0, height: 1000, width: 1000 }),
});

function getElPosition(element: string | Element): {
  top: number;
  left: number;
  width: number;
  height: number;
} {
  const menu = typeof element === "string" ? fixture.querySelector<HTMLElement>(element)! : element;

  const top = getStylePropertyInPx(menu.parentElement!, "top")!;
  const left = getStylePropertyInPx(menu.parentElement!, "left")!;
  const width = getStylePropertyInPx(menu.parentElement!, "width");
  const height = getStylePropertyInPx(menu.parentElement!, "height");
  const maxHeight = getStylePropertyInPx(menu.parentElement!, "max-height")!;
  const maxWidth = getStylePropertyInPx(menu.parentElement!, "max-width")!;

  return {
    top,
    left,
    width: width || maxWidth,
    height: height || maxHeight,
  };
}

function getMenuPosition() {
  const { left, top } = getElPosition(".o-menu");
  return { left, top: top };
}

function getSubMenuPosition(depth = 1) {
  const { left, top } = getElPosition(fixture.querySelectorAll(".o-menu")[depth]);
  return { left, top: top };
}

function getItemSize() {
  return MENU_ITEM_HEIGHT;
}

function getSize(menuItemsCount: number): { width: number; height: number } {
  return {
    width: MENU_WIDTH,
    height: getItemSize() * menuItemsCount + 2 * MENU_VERTICAL_PADDING,
  };
}

function getMenuSize() {
  const menu = fixture.querySelector(".o-menu");
  const menuItems = menu!.querySelectorAll(".o-menu-item");
  return getSize(menuItems.length);
}

function getSubMenuSize(depth = 1) {
  const menu = fixture.querySelectorAll(".o-menu")[depth];
  const menuItems = menu!.querySelectorAll(".o-menu-item");
  return getSize(menuItems.length);
}

describe("Standalone context menu tests", () => {
  beforeEach(async () => {
    const clipboard = new MockClipboard();
    Object.defineProperty(navigator, "clipboard", {
      get() {
        return clipboard;
      },
      configurable: true,
    });

    ({ model, fixture } = await mountSpreadsheet());
  });

  function getSelectionAnchorCellXc(model: Model): string {
    const { col, row } = model.getters.getSelection().anchor.cell;
    return toXC(col, row);
  }

  interface ContextMenuTestConfig {
    onClose?: () => void;
    menuItems?: MenuItem[];
  }

  async function renderContextMenu(
    x: number,
    y: number,
    testConfig: ContextMenuTestConfig = {},
    width = 1000,
    height = 1000
  ): Promise<[number, number]> {
    // x, y are relative to the upper left grid corner, but the menu
    // props must take the top bar into account.

    const model = new Model();
    const props = { x, y, width, height, model, config: testConfig };
    ({ fixture } = await mountComponent(ContextMenuParent, { props, fixture, model }));
    await nextTick();
    return [x, y];
  }

  const subMenu: MenuItem[] = createMenu([
    {
      id: "root",
      name: "root",
      children: [
        () => [
          {
            id: "subMenu1",
            name: "subMenu1",
            action() {},
          },
          {
            id: "subMenu2",
            name: "subMenu2",
            action() {},
          },
        ],
      ],
    },
  ]);

  class ContextMenuParent extends Component {
    static template = xml/* xml */ `
    <div class="o-spreadsheet">
      <Menu
        onClose="() => this.onClose()"
        position="position"
        menuItems="menus"
      />
    </div>
  `;
    static components = { Menu };
    menus!: MenuItem[];
    position!: { x: number; y: number; width: number; height: number };
    onClose!: () => void;

    setup() {
      useSubEnv({
        model: this.props.model,
        isDashboard: () => this.props.model.getters.isDashboard(),
      });
    }

    constructor(props, env, node) {
      super(props, env, node);
      this.onClose = this.props.config.onClose || (() => {});
      this.position = {
        x: this.props.x,
        y: this.props.y,
        width: this.props.width,
        height: this.props.height,
      };
      this.menus =
        this.props.config.menuItems ||
        createMenu([
          {
            id: "Action",
            name: "Action",
            action() {},
          },
        ]);
      this.props.model.dispatch("RESIZE_SHEETVIEW", {
        height: this.props.height,
        width: this.props.width,
        gridOffsetX: 0,
        gridOffsetY: 0,
      });
    }
  }

  describe("Context Menu", () => {
    test("context menu simple rendering", async () => {
      await rightClickCell(model, "C8");
      expect(fixture.querySelector(".o-menu")).toMatchSnapshot();
    });

    test("right click on a cell opens a context menu", async () => {
      expect(getSelectionAnchorCellXc(model)).toBe("A1");
      expect(fixture.querySelector(".o-menu")).toBeFalsy();
      await rightClickCell(model, "C8");
      expect(getSelectionAnchorCellXc(model)).toBe("C8");
      expect(fixture.querySelector(".o-menu")).toBeTruthy();
    });

    test("right click on a cell, then left click elsewhere closes a context menu", async () => {
      await rightClickCell(model, "C8");
      expect(getSelectionAnchorCellXc(model)).toBe("C8");
      await nextTick();
      expect(fixture.querySelector(".o-menu")).toBeTruthy();

      await simulateClick(".o-grid-overlay", 50, 50);
      expect(fixture.querySelector(".o-menu")).toBeFalsy();
    });

    test("right click on a cell, then hitting esc key closes a context menu", async () => {
      await rightClickCell(model, "C8");
      expect(fixture.querySelector(".o-menu")).toBeTruthy();

      await keyDown("Escape");
      expect(fixture.querySelector(".o-menu")).toBeFalsy();
    });

    test("can copy/paste with context menu", async () => {
      setCellContent(model, "B1", "b1");

      await rightClickCell(model, "B1");
      expect(getSelectionAnchorCellXc(model)).toBe("B1");

      // click on 'copy' menu item
      await simulateClick(".o-menu div[data-name='copy']");

      await rightClickCell(model, "B2");

      // click on 'paste' menu item
      await simulateClick(".o-menu div[data-name='paste']");
      expect(getCellContent(model, "B1")).toBe("b1");
      expect(getCellContent(model, "B2")).toBe("b1");
    });

    test("can cut/paste with context menu", async () => {
      setCellContent(model, "B1", "b1");

      await rightClickCell(model, "B1");

      // click on 'cut' menu item
      await simulateClick(".o-menu div[data-name='cut']");

      // right click on B2
      await rightClickCell(model, "B2");
      await nextTick();
      expect(getSelectionAnchorCellXc(model)).toBe("B2");

      // click on 'paste' menu item
      await simulateClick(".o-menu div[data-name='paste']");

      expect(getCell(model, "B1")).toBeUndefined();
      expect(getCellContent(model, "B2")).toBe("b1");
    });

    test("menu does not close when right click elsewhere", async () => {
      await rightClickCell(model, "B1");
      expect(fixture.querySelector(".o-menu")).toBeTruthy();
      await rightClickCell(model, "D5");
      expect(fixture.querySelector(".o-menu")).toBeTruthy();
    });

    test("close contextmenu when clicking on menubar", async () => {
      await rightClickCell(model, "B1");
      expect(fixture.querySelector(".o-menu .o-menu-item[data-name='cut']")).toBeTruthy();
      await click(fixture, ".o-topbar-topleft");
      expect(fixture.querySelector(".o-menu")).toBeFalsy();
    });

    test("close contextmenu when clicking on menubar item", async () => {
      await rightClickCell(model, "B1");
      expect(fixture.querySelector(".o-menu .o-menu-item[data-name='cut']")).toBeTruthy();
      await click(fixture, ".o-topbar-menu[data-id='insert']");
      expect(fixture.querySelector(".o-menu .o-menu-item[data-name='cut']")).toBeFalsy();
    });
    test("close contextmenu when clicking on tools bar", async () => {
      await rightClickCell(model, "B1");
      expect(fixture.querySelector(".o-menu .o-menu-item[data-name='cut']")).toBeTruthy();
      await click(fixture, '.o-tool[title="Font Size"]');
      expect(fixture.querySelector(".o-menu .o-menu-item[data-name='cut']")).toBeFalsy();
    });

    test("menu can be hidden/displayed based on the env", async () => {
      const menuDefinitions = Object.assign({}, cellMenuRegistry.content);
      cellMenuRegistry
        .add("visible_action", {
          name: "visible_action",
          isVisible: (env) => getEvaluatedCell(model, "B1").value === "b1",
          action() {},
        })
        .add("hidden_action", {
          name: "hidden_action",
          isVisible: (env) => getEvaluatedCell(model, "B1").value !== "b1",
          action() {},
        });
      setCellContent(model, "B1", "b1");
      await rightClickCell(model, "B1");
      expect(fixture.querySelector(".o-menu div[data-name='visible_action']")).toBeTruthy();
      expect(fixture.querySelector(".o-menu div[data-name='hidden_action']")).toBeFalsy();
      cellMenuRegistry.content = menuDefinitions;
    });

    test("submenu opens and close when (un)overed", async () => {
      const menuItems = createMenu([
        {
          id: "action",
          name: "action",
          action() {},
        },
        {
          id: "root",
          name: "root",
          children: [
            () => [
              {
                id: "subMenu",
                name: "subMenu",
                action() {},
              },
            ],
          ],
        },
      ]);
      await renderContextMenu(300, 300, { menuItems });
      triggerMouseEvent(".o-menu div[data-name='root']", "mouseover");
      await nextTick();
      expect(fixture.querySelector(".o-menu div[data-name='subMenu']")).toBeTruthy();
      triggerMouseEvent(".o-menu div[data-name='action']", "mouseover");
      await nextTick();
      expect(fixture.querySelector(".o-menu div[data-name='subMenu']")).toBeFalsy();
    });

    test("Submenu parent is highlighted", async () => {
      await renderContextMenu(300, 300, { menuItems: cellMenuRegistry.getMenuItems() });
      const menuItem = fixture.querySelector(".o-menu div[data-name='paste_special']");
      expect(menuItem?.classList).not.toContain("o-menu-item-active");
      triggerMouseEvent(menuItem, "mouseover");
      await nextTick();
      expect(menuItem?.classList).toContain("o-menu-item-active");
      triggerMouseEvent(".o-menu div[data-name='paste_value_only']", "mouseover");
      await nextTick();
      expect(menuItem?.classList).toContain("o-menu-item-active");
    });

    test("submenu does not open when disabled", async () => {
      const menuItems: MenuItem[] = createMenu([
        {
          id: "root",
          name: "root",
          isEnabled: () => false,
          children: [
            {
              name: "subMenu",
              id: "subMenu",
              action() {},
            },
          ],
        },
      ]);
      await renderContextMenu(300, 300, { menuItems });
      expect(fixture.querySelector(".o-menu div[data-name='root']")!.classList).toContain(
        "disabled"
      );
      await simulateClick(".o-menu div[data-name='root']");
      expect(fixture.querySelector(".o-menu div[data-name='subMenu']")).toBeFalsy();
    });

    test("submenu does not close when sub item overed", async () => {
      await renderContextMenu(300, 300, { menuItems: subMenu });
      triggerMouseEvent(".o-menu div[data-name='root']", "mouseover");
      await nextTick();
      expect(fixture.querySelector(".o-menu div[data-name='subMenu1']")).toBeTruthy();
      triggerMouseEvent(".o-menu div[data-name='subMenu1']", "mouseover");
      await nextTick();
      expect(fixture.querySelector(".o-menu div[data-name='subMenu1']")).toBeTruthy();
    });

    test("menu does not close when root menu is clicked", async () => {
      await renderContextMenu(300, 300, { menuItems: subMenu });
      await simulateClick(".o-menu div[data-name='root']");
      expect(fixture.querySelector(".o-menu div[data-name='subMenu1']")).toBeTruthy();
      expect(fixture.querySelector(".o-menu div[data-name='root']")).toBeTruthy();
    });

    test("menu closed when sub menu item is clicked", async () => {
      const mockCallback = jest.fn(() => {});
      await renderContextMenu(300, 300, {
        onClose: mockCallback,
        menuItems: subMenu,
      });
      await simulateClick(".o-menu div[data-name='root']");
      await simulateClick(".o-menu div[data-name='subMenu1']");
      expect(fixture.querySelector(".o-menu div[data-name='subMenu1']")).toBeFalsy();
      expect(mockCallback).toHaveBeenCalled();
    });

    test("it renders subsubmenus", async () => {
      const menuItems = createMenu([
        {
          id: "root1",
          name: "root1",
          children: [
            () => [
              {
                id: "root2",
                name: "root2",
                children: [
                  () => [
                    {
                      id: "subMenu",
                      name: "subMenu",
                      action() {},
                    },
                  ],
                ],
              },
            ],
          ],
        },
      ]);
      await renderContextMenu(300, 990, { menuItems });
      await simulateClick("div[data-name='root1']");
      await simulateClick("div[data-name='root2']");
      expect(fixture.querySelector(".o-menu div[data-name='subMenu']")).toBeTruthy();
    });

    test("Menu with icon is correctly displayed", async () => {
      const menuItems: MenuItem[] = createMenu([
        {
          id: "root1",
          name: "root1",
          icon: "not-displayed-class",
          children: [
            () => [
              {
                id: "root2",
                name: "root2",
                action() {},
                icon: "my-class",
              },
            ],
          ],
        },
      ]);
      await renderContextMenu(300, 990, { menuItems });
      expect(fixture.querySelector("div[data-name='root1'] > i")).toBeNull();
      await simulateClick("div[data-name='root1']");
      expect(fixture.querySelector("div[data-name='root2'] > i")?.classList).toContain("my-class");
    });

    test("Can color menu items", async () => {
      const menuItems: MenuItem[] = createMenu([
        {
          id: "black",
          name: "black",
          action() {},
        },
        {
          id: "orange",
          name: "orange",
          action() {},
          textColor: "orange",
        },
      ]);
      await renderContextMenu(0, 0, { menuItems });
      expect((fixture.querySelector("div[data-name='black']") as HTMLElement).style.color).toEqual(
        ""
      );
      expect((fixture.querySelector("div[data-name='orange']") as HTMLElement).style.color).toEqual(
        "orange"
      );
    });

    test("Only submenus of the current parent are visible", async () => {
      const menuItems = createMenu([
        {
          id: "root_1",
          name: "root_1",
          children: [
            () => [
              {
                id: "root_1_1",
                name: "root_1_1",
                children: [
                  () => [
                    {
                      id: "subMenu_1",
                      name: "subMenu_1",
                      action() {},
                    },
                  ],
                ],
              },
            ],
          ],
        },
        {
          id: "root_2",
          name: "root_2",
          children: [
            () => [
              {
                id: "root_2_1",
                name: "root_2_1",
                children: [
                  () => [
                    {
                      id: "subMenu_2",
                      name: "subMenu_2",
                      action() {},
                    },
                  ],
                ],
              },
            ],
          ],
        },
      ]);
      await renderContextMenu(300, 300, { menuItems });

      triggerMouseEvent(".o-menu div[data-name='root_1']", "mouseover");
      await nextTick();
      triggerMouseEvent(".o-menu div[data-name='root_1_1']", "mouseover");
      await nextTick();
      expect(fixture.querySelector(".o-menu div[data-name='subMenu_1']")).toBeTruthy();
      triggerMouseEvent(".o-menu div[data-name='root_2']", "mouseover");
      await nextTick();
      expect(fixture.querySelector(".o-menu div[data-name='subMenu_1']")).toBeFalsy();
      expect(fixture.querySelector(".o-menu div[data-name='root_2_1']")).toBeTruthy();
    });

    test("Submenu visibility is taken into account", async () => {
      const menuItems = createMenu([
        {
          id: "root",
          name: "root_1",
          children: [
            () => [
              {
                id: "menu_1",
                name: "root_1_1",
                children: [
                  () => [
                    {
                      id: "visible_submenu_1",
                      name: "visible_submenu_1",
                      action() {},
                      isVisible: () => true,
                    },
                    {
                      id: "invisible_submenu_1",
                      name: "invisible_submenu_1",
                      action() {},
                      isVisible: () => false,
                    },
                  ],
                ],
              },
            ],
          ],
        },
      ]);
      await renderContextMenu(300, 300, { menuItems });
      triggerMouseEvent(".o-menu div[data-name='root']", "mouseover");
      await nextTick();
      expect(fixture.querySelector(".o-menu div[data-name='menu_1']")).toBeTruthy();
      triggerMouseEvent(".o-menu div[data-name='menu_1']", "mouseover");
      await nextTick();
      expect(fixture.querySelector(".o-menu div[data-name='visible_submenu_1']")).toBeTruthy();
      expect(fixture.querySelector(".o-menu div[data-name='invisible_submenu_1']")).toBeFalsy();
    });

    test("scroll through the menu with the wheel / scrollbar prevents the grid from scrolling", async () => {
      const verticalScrollBar = fixture.querySelector(".o-scrollbar.vertical") as HTMLElement;
      const horizontalScrollBar = fixture.querySelector(".o-scrollbar.horizontal") as HTMLElement;
      expect(verticalScrollBar.scrollTop).toBe(0);
      expect(horizontalScrollBar.scrollLeft).toBe(0);

      await rightClickCell(model, "C8");

      const menu = fixture.querySelector(".o-menu")!;
      // scroll
      menu.dispatchEvent(
        new WheelEvent("wheel", { deltaY: 300, deltaX: 300, deltaMode: 0, bubbles: true })
      );
      menu.dispatchEvent(new Event("scroll", { bubbles: true }));
      await nextTick();

      // grid always at (0, 0) scroll position
      expect(verticalScrollBar.scrollTop).toBe(0);
      expect(horizontalScrollBar.scrollLeft).toBe(0);
    });

    test("scroll through the menu with the touch device prevents the grid from scrolling", async () => {
      const verticalScrollBar = fixture.querySelector(".o-scrollbar.vertical") as HTMLElement;
      const horizontalScrollBar = fixture.querySelector(".o-scrollbar.horizontal") as HTMLElement;

      expect(verticalScrollBar.scrollTop).toBe(0);
      expect(horizontalScrollBar.scrollLeft).toBe(0);

      await rightClickCell(model, "C8");

      const menu = fixture.querySelector(".o-menu")!;

      // start move at (310, 210) touch position
      menu.dispatchEvent(
        new TouchEvent("touchstart", {
          bubbles: true,
          cancelable: true,
          touches: [
            new Touch({
              clientX: 310,
              clientY: 210,
              identifier: 1,
              target: menu,
            }),
          ],
        })
      );
      // move down;
      menu.dispatchEvent(
        new TouchEvent("touchmove", {
          bubbles: true,
          cancelable: true,
          touches: [
            new Touch({
              clientX: 310,
              clientY: 180,
              identifier: 2,
              target: menu,
            }),
          ],
        })
      );

      await nextTick();
      // grid always at (0, 0) scroll position
      expect(verticalScrollBar.scrollTop).toBe(0);
      expect(horizontalScrollBar.scrollLeft).toBe(0);
    });
  });

  describe("Context Menu position on large screen 1000px/1000px", () => {
    test("it renders menu on the bottom right if enough space", async () => {
      const [clickX, clickY] = await renderContextMenu(300, 300);
      const { left, top } = getMenuPosition();
      expect(left).toBe(clickX);
      expect(top).toBe(clickY);
    });

    test("it renders menu on the top right if not enough space", async () => {
      const [clickX, clickY] = await renderContextMenu(300, 990);
      const { left, top } = getMenuPosition();
      const { height } = getMenuSize();
      expect(left).toBe(clickX);
      expect(top).toBe(clickY - height);
    });

    test("it renders menu on the bottom left if not enough space", async () => {
      const [clickX, clickY] = await renderContextMenu(990, 300);
      const { left, top } = getMenuPosition();
      const { width } = getMenuSize();
      expect(left).toBe(clickX - width);
      expect(top).toBe(clickY);
    });

    test("it renders menu on the top left if not enough space", async () => {
      const [clickX, clickY] = await renderContextMenu(990, 990);
      const { left, top } = getMenuPosition();
      const { width, height } = getMenuSize();
      expect(left).toBe(clickX - width);
      expect(top).toBe(clickY - height);
    });

    test("it renders submenu on the bottom right if enough space", async () => {
      const [clickX, clickY] = await renderContextMenu(300, 300, { menuItems: subMenu });
      await simulateClick("div[data-name='root']");
      const { left, top } = getSubMenuPosition();
      const { width } = getMenuSize();
      expect(left).toBe(clickX + width);
      expect(top).toBe(clickY);
    });

    test("it renders submenu on the bottom left if not enough space", async () => {
      const [clickX, clickY] = await renderContextMenu(1000 - MENU_WIDTH - 10, 300, {
        menuItems: subMenu,
      });
      await simulateClick("div[data-name='root']");
      const { left, top } = getSubMenuPosition();
      const { width } = getMenuSize();
      const { left: rootLeft } = getMenuPosition();
      expect(rootLeft).toBe(clickX);
      expect(left).toBe(clickX - width);
      expect(top).toBe(clickY);
    });

    test("it renders all menus on the bottom left if not enough space", async () => {
      const [clickX, clickY] = await renderContextMenu(990, 300, { menuItems: subMenu });
      await simulateClick("div[data-name='root']");
      const { left, top } = getSubMenuPosition();
      const { width } = getMenuSize();
      const { left: rootLeft } = getMenuPosition();
      expect(rootLeft).toBe(clickX - width);
      expect(left).toBe(clickX - 2 * width);
      expect(top).toBe(clickY);
    });

    test("it renders submenu on the top right if not enough space", async () => {
      const [clickX, clickY] = await renderContextMenu(300, 960, { menuItems: subMenu });
      await simulateClick("div[data-name='root']");
      const { left, top } = getSubMenuPosition();
      const { height } = getSubMenuSize();
      const { width } = getMenuSize();
      expect(top).toBe(clickY - height + getItemSize());
      expect(left).toBe(clickX + width);
    });

    test("it renders all menus on the top right if not enough space", async () => {
      const [clickX, clickY] = await renderContextMenu(300, 990, { menuItems: subMenu });
      await simulateClick("div[data-name='root']");
      const { left, top } = getSubMenuPosition();
      const { top: rootTop } = getMenuPosition();
      const { height, width } = getSubMenuSize();
      const { height: rootHeight } = getMenuSize();
      expect(rootTop).toBe(clickY - rootHeight);
      expect(top).toBe(clickY - height);
      expect(left).toBe(clickX + width);
    });

    test("multi depth menu is properly placed on the screen", async () => {
      const subMenus: MenuItem[] = createMenu([
        {
          id: "root",
          name: "root",
          children: [
            {
              id: "subMenu",
              name: "subMenu",
              children: [
                {
                  id: "subSubMenu",
                  name: "subSubMenu",
                  action() {},
                },
              ],
            },
          ],
        },
      ]);
      const [clickX] = await renderContextMenu(100, 100, { menuItems: subMenus });
      await simulateClick("div[data-name='root']");
      await simulateClick("div[data-name='subMenu']");
      const { left: secondSubLeft } = getSubMenuPosition(2);
      const { width: subMenuWidth } = getSubMenuSize();
      const { width: rootWidth } = getMenuSize();
      expect(secondSubLeft).toBe(clickX + rootWidth + subMenuWidth);
    });
  });
});

describe("Context menu react to grid size changes", () => {
  beforeEach(async () => {
    ({ model, fixture } = await mountSpreadsheet());
  });

  test("Submenu is closed when grid size change make the parent menu hidden", async () => {
    fixture
      .querySelector(".o-grid-overlay")!
      .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 800, clientY: 0 }));
    await nextTick();
    await simulateClick("div[data-name='paste_special']");
    let menus = fixture.querySelectorAll(".o-menu");
    expect(menus[0].parentElement?.style.display).toBe("block");
    expect(menus[1]).toBeTruthy();

    model.dispatch("RESIZE_SHEETVIEW", { width: 500, height: 500 });
    await nextTick();
    await nextTick(); // First render hides the parent menu, second closes the submenu

    menus = fixture.querySelectorAll(".o-menu");
    expect(menus[0].parentElement?.style.display).toBe("none");
    expect(menus[1]).toBeFalsy();
  });

  test("Submenu is closed when grid size change moves the parent menu", async () => {
    fixture
      .querySelector(".o-grid-overlay")!
      .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 500, clientY: 0 }));
    await nextTick();
    await simulateClick("div[data-name='paste_special']");
    let menus = fixture.querySelectorAll(".o-menu");
    expect(menus[0].parentElement?.style.left).toBe("500px");
    expect(menus[1]).toBeTruthy();

    model.dispatch("RESIZE_SHEETVIEW", { width: 500 + MENU_WIDTH / 2, height: 1000 });
    await nextTick();
    await nextTick(); // First render moves the parent menu, second closes the submenu

    menus = fixture.querySelectorAll(".o-menu");
    expect(menus[0].parentElement?.style.left).toBe(`${500 - MENU_WIDTH}px`);
    expect(menus[1]).toBeFalsy();
  });
});

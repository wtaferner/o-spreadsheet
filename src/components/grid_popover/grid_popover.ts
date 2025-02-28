import { Component } from "@odoo/owl";
import { Position, Rect, SpreadsheetChildEnv } from "../../types";
import { ClosedCellPopover, PositionedCellPopover } from "../../types/cell_popovers";
import { Popover } from "../popover/popover";

interface Props {
  hoveredCell: Partial<Position>;
  gridRect: Rect;
  onClosePopover: () => void;
  onMouseWheel: (ev: WheelEvent) => void;
}
export class GridPopover extends Component<Props, SpreadsheetChildEnv> {
  static template = "o-spreadsheet-GridPopover";
  static components = { Popover };

  get cellPopover(): PositionedCellPopover | ClosedCellPopover {
    const popover = this.env.model.getters.getCellPopover(this.props.hoveredCell);
    if (!popover.isOpen) {
      return { isOpen: false };
    }
    const anchorRect = popover.anchorRect;
    return {
      ...popover,
      // transform from the "canvas coordinate system" to the "body coordinate system"
      anchorRect: {
        ...anchorRect,
        x: anchorRect.x + this.props.gridRect.x,
        y: anchorRect.y + this.props.gridRect.y,
      },
    };
  }
}

GridPopover.props = {
  hoveredCell: Object,
  onClosePopover: Function,
  onMouseWheel: Function,
  gridRect: Object,
};

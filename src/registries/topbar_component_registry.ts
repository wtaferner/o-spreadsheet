import { UuidGenerator } from "../helpers";
import { UID } from "../types";
import { SpreadsheetChildEnv } from "../types/env";
import { Registry } from "./registry";

//------------------------------------------------------------------------------
// Topbar Component Registry
//------------------------------------------------------------------------------
interface TopbarComponent {
  id: UID;
  component: any;
  isVisible?: (env: SpreadsheetChildEnv) => boolean;
}

class TopBarComponentRegistry extends Registry<TopbarComponent> {
  mapping: { [key: string]: Function } = {};
  uuidGenerator = new UuidGenerator();

  add(name: string, value: Omit<TopbarComponent, "id">) {
    const component: TopbarComponent = { ...value, id: this.uuidGenerator.uuidv4() };
    return super.add(name, component);
  }
}

export const topbarComponentRegistry = new TopBarComponentRegistry();

import { setBasePath } from "../vendor/webawesome/dist/webawesome.js";
import "../vendor/webawesome/dist/components/input/input.js";
import "../vendor/webawesome/dist/components/select/select.js";
import "../vendor/webawesome/dist/components/option/option.js";
import "../vendor/webawesome/dist/components/dropdown/dropdown.js";
import "../vendor/webawesome/dist/components/dropdown-item/dropdown-item.js";
import "../vendor/webawesome/dist/components/tooltip/tooltip.js";
import "../vendor/webawesome/dist/components/popover/popover.js";

setBasePath(new URL("../vendor/webawesome/dist/", import.meta.url).href);

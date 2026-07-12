import { setBasePath } from "../../vendor/webawesome/dist/webawesome.js";
import "../../vendor/webawesome/dist/components/button/button.js";
import "../../vendor/webawesome/dist/components/tooltip/tooltip.js";

setBasePath(new URL("../../vendor/webawesome/dist/", import.meta.url).href);

await Promise.all([
  customElements.whenDefined("wa-button"),
  customElements.whenDefined("wa-tooltip")
]);

const button = document.querySelector("#phase0SmokeButton");
const tooltip = document.querySelector('wa-tooltip[for="phase0SmokeButton"]');
let clickCount = 0;

button.addEventListener("click", () => {
  clickCount += 1;
});

window.zipTabWebAwesomeSmoke = {
  button,
  tooltip,
  get clickCount() {
    return clickCount;
  }
};

document.documentElement.dataset.webawesomeReady = "true";

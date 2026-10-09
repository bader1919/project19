/**
 * After the element that held keyboard focus was removed (a deleted row, a closed form), focus would drop to <body>.
 * Park it on `targetId` (a heading or the main region, both focusable with tabindex="-1").
 */
export function focusIfLost(targetId: string) {
  const check = () => {
    const a = document.activeElement;
    if (!a || a === document.body) document.getElementById(targetId)?.focus();
  };
  // Twice: once now, and once after a background reload has removed the row that held focus.
  requestAnimationFrame(check);
  setTimeout(check, 700);
}
